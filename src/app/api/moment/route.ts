import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, serverUser } from "@/lib/backend";
import { requireOpenAiKey } from "@/lib/openai";

export const runtime = "nodejs";
const requestSchema = z.object({ sessionId: z.string().uuid(), turnIndex: z.number().int().nonnegative(),
  original: z.string().min(1).max(2000), prompt: z.string().max(2000) });
const resultSchema = z.object({ kind: z.enum(["clear_error", "acceptable", "uncertain_transcript"]), correction: z.string(),
  alternative: z.string().nullable(), explanation: z.string() });
const schema = { type: "object", properties: { kind: { type: "string", enum: ["clear_error", "acceptable", "uncertain_transcript"] },
  correction: { type: "string" }, alternative: { type: ["string", "null"] }, explanation: { type: "string" } },
  required: ["kind", "correction", "alternative", "explanation"], additionalProperties: false };

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Open the retry from this app." }, { status: 403 });
  const user = await serverUser(request).catch(() => null);
  if (!user) return NextResponse.json({ error: "Learning session unavailable. Reload the page and try again." }, { status: 401 });
  let parsed;
  try { parsed = requestSchema.safeParse(await request.json()); } catch { return NextResponse.json({ error: "Invalid moment request." }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: "Invalid moment request." }, { status: 400 });
  try {
    const sessions = await db<{ id: string }[]>(`sessions?id=eq.${parsed.data.sessionId}&select=id`, { token: user.token });
    if (!sessions.length) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${requireOpenAiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_REVIEW_MODEL || "gpt-4o-mini", store: false,
        instructions: "Assess one German learner utterance transcribed from voice. Return JSON. Identify at most one important genuine language error. If wording is already acceptable, mark acceptable; optional style is not an error. If transcription looks uncertain, mark uncertain_transcript. Do not assess pronunciation. For a clear error, minimally correct the whole utterance and briefly explain the point in English. An alternative may be null.",
        input: JSON.stringify({ precedingCoachPrompt: parsed.data.prompt, learnerUtterance: parsed.data.original }),
        text: { format: { type: "json_schema", name: "moment_feedback", strict: true, schema } } }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error("Moment analysis is temporarily unavailable.");
    const data = await response.json();
    const output = data.output?.flatMap((item: { content?: { type: string; text?: string }[] }) => item.content || []).find((item: { type: string }) => item.type === "output_text")?.text;
    const result = resultSchema.parse(JSON.parse(output));
    return NextResponse.json(result.kind === "clear_error" && result.correction.trim() !== parsed.data.original.trim()
      ? result : { kind: result.kind, correction: "", alternative: null, explanation: result.explanation || "This wording may be acceptable. Try another natural answer." });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Moment analysis failed." }, { status: 502 }); }
}
