import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, serverUser } from "@/lib/backend";
import { requireOpenAiKey } from "@/lib/openai";

export const runtime = "nodejs";
const requestSchema = z.object({ sourceSessionId: z.string().uuid(), turnIndex: z.number().int().nonnegative(),
  original: z.string().min(1).max(2000), correction: z.string().max(2000), attempt: z.string().min(1).max(2000), assisted: z.boolean(), attemptId: z.string().uuid() });
const resultSchema = z.object({ valid: z.boolean(), feedback: z.string().min(1).max(500) });
const schema = { type: "object", properties: { valid: { type: "boolean" }, feedback: { type: "string" } }, required: ["valid", "feedback"], additionalProperties: false };

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Open the retry from this app." }, { status: 403 });
  const user = await serverUser(request).catch(() => null);
  if (!user) return NextResponse.json({ error: "Learning session unavailable. Reload the page and try again." }, { status: 401 });
  let parsed;
  try { parsed = requestSchema.safeParse(await request.json()); } catch { return NextResponse.json({ error: "Invalid retry request." }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: "Invalid retry request." }, { status: 400 });
  const body = parsed.data;
  try {
    const sessions = await db<{ id: string }[]>(`sessions?id=eq.${body.sourceSessionId}&select=id`, { token: user.token });
    if (!sessions.length) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    const existing = await db<{ feedback: string; result: string }[]>(`practice_attempts?id=eq.${body.attemptId}&select=feedback,result`, { token: user.token });
    if (existing.length) return NextResponse.json({ valid: existing[0].result !== "needs_work", feedback: existing[0].feedback });
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${requireOpenAiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_REVIEW_MODEL || "gpt-4o-mini", store: false,
        instructions: "Judge a German spoken retry from transcript text. Accept any valid natural alternative, not exact wording. Treat uncertain transcription cautiously. Do not assess pronunciation. Give one concise, actionable point in English. Return JSON.",
        input: JSON.stringify({ original: body.original, suggestedCorrection: body.correction, attempt: body.attempt }),
        text: { format: { type: "json_schema", name: "retry_feedback", strict: true, schema } } }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error("Feedback is temporarily unavailable.");
    const data = await response.json();
    const output = data.output?.flatMap((item: { content?: { type: string; text?: string }[] }) => item.content || []).find((item: { type: string }) => item.type === "output_text")?.text;
    const result = resultSchema.parse(JSON.parse(output));
    const targets = await db<{ id: string; independent_uses: number; assisted_uses: number }[]>(`learning_targets?source_session_id=eq.${body.sourceSessionId}&source_turn_index=eq.${body.turnIndex}&select=id,independent_uses,assisted_uses&limit=1`, { token: user.token });
    const target = targets[0];
    const status = result.valid ? body.assisted ? "assisted" : "independent" : "needs_work";
    const inserted = await db<{ id: string }[]>("practice_attempts?on_conflict=id", { method: "POST", token: user.token, prefer: "resolution=ignore-duplicates,return=representation",
      body: { id: body.attemptId, user_id: user.id, session_id: body.sourceSessionId, target_id: target?.id || null,
        source_turn_index: body.turnIndex, kind: "retry", result: status, utterance: body.attempt, feedback: result.feedback } });
    if (target && inserted.length && result.valid) {
      const field = body.assisted ? "assisted_uses" : "independent_uses";
      await db(`learning_targets?id=eq.${target.id}`, { method: "PATCH", token: user.token, body: { [field]: target[field] + 1 } });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Feedback failed." }, { status: 502 });
  }
}
