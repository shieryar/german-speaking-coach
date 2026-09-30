import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, serverUser } from "@/lib/backend";
import { requireOpenAiKey } from "@/lib/openai";
import { missionById } from "@/lib/scenarios";
import { validatedReview, type Review, type Turn } from "@/lib/learning";

export const runtime = "nodejs";
const turnSchema = z.object({ turn_index: z.number().int().nonnegative(), speaker: z.enum(["user", "assistant"]),
  text: z.string().max(2000), start_ms: z.number().int().nonnegative(), end_ms: z.number().int().nonnegative() });
const requestSchema = z.object({ sessionId: z.string().uuid(), turns: z.array(turnSchema).max(100).default([]), hintAfterTurns: z.array(z.number().int().nonnegative()).max(30).default([]) });
type SessionRow = { id: string; mission_id: string; difficulty: string; retain_transcript: boolean; review: Review | null; focus_target_ids: string[]; focus_vocab_ids: string[] };
const obj = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const string = { type: "string" };
const integer = { type: "integer" };
const nullableString = { type: ["string", "null"] };
const nullableInteger = { type: ["integer", "null"] };
const schema = obj({
  objectives: { type: "array", items: obj({ objective_index: integer, complete: { type: "boolean" }, learner_turn_index: nullableInteger }) },
  language_summary: string,
  improvements: { type: "array", items: obj({ turn_index: integer, original: string, correction: string, natural_alternative: nullableString, explanation: string, category: string,
    certainty: { type: "string", enum: ["clear_error", "uncertain_transcript", "optional_style"] } }) },
  vocabulary: { type: "array", items: obj({ turn_index: integer, expression: string, meaning: string, article: nullableString, plural: nullableString, usage_pattern: nullableString, example: string }) },
  practice_evidence: { type: "array", items: obj({ kind: { type: "string", enum: ["target", "vocabulary"] }, id: string, turn_index: integer, result: { type: "string", enum: ["assisted", "independent"] } }) },
});
function stableUuid(value: string) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function fingerprint(category: string, correction: string) {
  return createHash("sha256").update(`${category.toLowerCase().trim()}|${correction.toLowerCase().trim()}`).digest("hex");
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Open the review from this app." }, { status: 403 });
  let user;
  try { user = await serverUser(request); } catch { return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 }); }
  if (!user) return NextResponse.json({ error: "Learning session unavailable. Reload the page and try again." }, { status: 401 });
  const raw = await request.text();
  if (raw.length > 150_000) return NextResponse.json({ error: "Transcript is too large to review." }, { status: 413 });
  let parsed;
  try { parsed = requestSchema.safeParse(JSON.parse(raw)); } catch { return NextResponse.json({ error: "Invalid review request." }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: "Invalid review request." }, { status: 400 });
  const { sessionId, hintAfterTurns } = parsed.data;
  try {
    const rows = await db<SessionRow[]>(`sessions?id=eq.${sessionId}&select=*`, { token: user.token });
    const session = rows[0];
    if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    if (session.review) return NextResponse.json({ review: session.review });
    const turns = parsed.data.turns.length ? parsed.data.turns as Turn[]
      : await db<Turn[]>(`transcript_turns?session_id=eq.${sessionId}&select=turn_index,speaker,text,start_ms,end_ms&order=turn_index.asc`, { token: user.token });
    if (!turns.length || turns.some((turn, i) => turn.turn_index !== i)) return NextResponse.json({ error: "Transcript turns are missing or out of order." }, { status: 400 });
    if (!missionById[session.mission_id]) return NextResponse.json({ error: "Mission not found." }, { status: 400 });
    await db(`sessions?id=eq.${sessionId}`, { method: "PATCH", token: user.token, body: { status: "ended", ended_at: new Date().toISOString() } });
    if (session.retain_transcript) {
      await db("transcript_turns?on_conflict=session_id,turn_index", { method: "POST", token: user.token, prefer: "resolution=merge-duplicates,return=minimal",
        body: turns.map((turn) => ({ ...turn, user_id: user.id, session_id: sessionId })) });
    }
    const [targets, vocab] = await Promise.all([
      session.focus_target_ids.length ? db<{ id: string; category: string; correction: string }[]>(`learning_targets?id=in.(${session.focus_target_ids.join(",")})&select=id,category,correction`, { token: user.token }) : [],
      session.focus_vocab_ids.length ? db<{ id: string; expression: string; meaning: string }[]>(`vocabulary?id=in.(${session.focus_vocab_ids.join(",")})&select=id,expression,meaning`, { token: user.token }) : [],
    ]);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${requireOpenAiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_REVIEW_MODEL || "gpt-4o-mini", store: false,
        instructions: "Review a German learner's voice transcript. Return JSON only. Judge mission objectives solely from learner turns, with a learner turn index for every completed objective. This is approximate practice difficulty, never an official CEFR assessment. Identify at most three high-value genuine grammar or word-choice errors. Copy the learner's whole utterance exactly into original; make the correction minimal. Put acceptable phrasing in optional_style and uncertain speech recognition in uncertain_transcript. Do not assess pronunciation from text. Give concise, specific language feedback. Suggest up to four useful vocabulary items. For prior targets or vocabulary, report practice evidence only if a learner turn independently uses it; if a hint preceded that turn, mark assisted. Do not infer recognition from the tutor's words.",
        input: JSON.stringify({ mission: missionById[session.mission_id], difficulty: session.difficulty, turns, hintAfterTurns, priorTargets: targets, dueVocabulary: vocab }),
        text: { format: { type: "json_schema", name: "session_review", strict: true, schema } },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error("Analysis service is unavailable. Try reviewing again.");
    const data = await response.json();
    const output = data.output?.flatMap((item: { content?: { type: string; text?: string }[] }) => item.content || []).find((item: { type: string }) => item.type === "output_text")?.text;
    if (typeof output !== "string") throw new Error("Analysis did not return a usable review. Try again.");
    const review = validatedReview(JSON.parse(output), session.mission_id, turns, session.focus_target_ids, session.focus_vocab_ids);
    // A hint helps only the next learner turn; never call that use independent.
    const assistedTurns = new Set(hintAfterTurns.map((index) => turns.find((turn) => turn.turn_index > index && turn.speaker === "user")?.turn_index).filter((index): index is number => index !== undefined));
    review.practice_evidence = review.practice_evidence.map((item) => assistedTurns.has(item.turn_index) ? { ...item, result: "assisted" } : item);
    for (const item of review.improvements) {
      const key = fingerprint(item.category, item.correction);
      let existing = (await db<{ id: string; occurrence_count: number }[]>(`learning_targets?fingerprint=eq.${key}&select=id,occurrence_count`, { token: user.token }))[0];
      if (!existing) {
        const inserted = await db<{ id: string; occurrence_count: number }[]>("learning_targets?on_conflict=user_id,fingerprint", { method: "POST", token: user.token, prefer: "resolution=ignore-duplicates,return=representation",
          body: { user_id: user.id, fingerprint: key, source_session_id: sessionId, source_turn_index: item.turn_index, original: item.original,
            correction: item.correction, natural_alternative: item.natural_alternative, explanation: item.explanation, category: item.category } });
        existing = inserted[0] || (await db<{ id: string; occurrence_count: number }[]>(`learning_targets?fingerprint=eq.${key}&select=id,occurrence_count`, { token: user.token }))[0];
      }
      if (!existing) continue;
      const occurrence = await db<{ target_id: string }[]>("learning_target_occurrences?on_conflict=target_id,session_id,turn_index", {
        method: "POST", token: user.token, prefer: "resolution=ignore-duplicates,return=representation",
        body: { target_id: existing.id, user_id: user.id, session_id: sessionId, turn_index: item.turn_index },
      });
      if (occurrence.length && existing.occurrence_count > 0) {
        const all = await db<{ target_id: string }[]>(`learning_target_occurrences?target_id=eq.${existing.id}&select=target_id`, { token: user.token });
        await db(`learning_targets?id=eq.${existing.id}`, { method: "PATCH", token: user.token, body: { occurrence_count: all.length } });
      }
    }
    for (const item of review.practice_evidence) {
      const id = stableUuid(`${sessionId}:${item.kind}:${item.id}:${item.turn_index}`);
      const inserted = await db<{ id: string }[]>("practice_attempts?on_conflict=id", { method: "POST", token: user.token, prefer: "resolution=ignore-duplicates,return=representation",
        body: { id, user_id: user.id, session_id: sessionId, target_id: item.kind === "target" ? item.id : null,
          vocabulary_id: item.kind === "vocabulary" ? item.id : null, source_turn_index: item.turn_index, kind: item.kind, result: item.result, utterance: turns[item.turn_index].text } });
      if (!inserted.length) continue;
      const table = item.kind === "target" ? "learning_targets" : "vocabulary";
      const records = await db<Record<string, number>[]>(`${table}?id=eq.${item.id}&select=*`, { token: user.token });
      if (!records[0]) continue;
      const field = item.result === "assisted" ? "assisted_uses" : "independent_uses";
      const count = Number(records[0][field] || 0) + 1;
      const { nextReview } = await import("@/lib/learning");
      const schedule = nextReview(item.result, Number(records[0].review_stage || 0));
      await db(`${table}?id=eq.${item.id}`, { method: "PATCH", token: user.token,
        body: item.kind === "vocabulary" ? { [field]: count, later_uses: item.result === "independent" ? Number(records[0].later_uses || 0) + 1 : Number(records[0].later_uses || 0), ...schedule }
          : { [field]: count, next_review_at: schedule.next_review_at } });
    }
    await db(`sessions?id=eq.${sessionId}&review=is.null`, { method: "PATCH", token: user.token, body: { status: "reviewed", review } });
    return NextResponse.json({ review });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Analysis failed. Please try again." }, { status: 502 });
  }
}
