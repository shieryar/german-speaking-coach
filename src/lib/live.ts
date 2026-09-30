import { z } from "zod";
import { scenarioLabels, type Scenario } from "./scenarios";

export const LIVE_STORAGE_KEY = "german-speaking-coach-live-sessions";
export const fragmentSchema = z.object({
  eventId: z.string(), speaker: z.enum(["user", "assistant"]), text: z.string(),
  startMs: z.number().nonnegative(), endMs: z.number().nonnegative(),
});
export type TranscriptFragment = z.infer<typeof fragmentSchema>;
export const savedLiveSchema = z.object({
  id: z.string(), scenario: z.string(), createdAt: z.string(),
  fragments: z.array(fragmentSchema), seconds: z.number().nonnegative(),
});
export type SavedLiveSession = z.infer<typeof savedLiveSchema>;

export function readLiveHistory(storage: Pick<Storage, "getItem">): SavedLiveSession[] {
  const raw = JSON.parse(storage.getItem(LIVE_STORAGE_KEY) || "[]");
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const result = savedLiveSchema.safeParse(entry);
    return result.success ? [result.data] : [];
  }).slice(0, 20);
}

export function saveLiveSession(history: SavedLiveSession[], session: SavedLiveSession) {
  return [session, ...history.filter((item) => item.id !== session.id)].slice(0, 20);
}

export function parseTranscript(event: Record<string, unknown>): TranscriptFragment | null {
  const speaker = event.type === "session.input_transcript.delta" ? "user"
    : event.type === "session.output_transcript.delta" ? "assistant" : null;
  if (!speaker) return null;
  const result = fragmentSchema.safeParse({
    eventId: event.event_id, speaker, text: event.delta, startMs: event.start_ms, endMs: event.end_ms,
  });
  return result.success ? result.data : null;
}

export function liveInstructions(scenario: Scenario) {
  return `You are a friendly German B1/B2 speaking partner for a professional in Switzerland. Practice ${scenarioLabels[scenario]}. Speak clear Standard German, keep replies short, and ask one relevant question at a time. Let the learner finish and handle interruptions naturally. Start with a brief German greeting and a question about the scenario. Keep the conversation going without unsolicited corrections or assessments. Explain briefly in English only if asked. This is spoken role-play only: no external tasks or tools are available, and do not delegate tasks. If asked to perform an external task, explain that you can only practice the conversation.`;
}
