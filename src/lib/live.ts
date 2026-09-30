import { z } from "zod";

export const fragmentSchema = z.object({
  eventId: z.string(), speaker: z.enum(["user", "assistant"]), text: z.string(),
  startMs: z.number().nonnegative(), endMs: z.number().nonnegative(),
});
export type TranscriptFragment = z.infer<typeof fragmentSchema>;

export function parseTranscript(event: Record<string, unknown>): TranscriptFragment | null {
  const speaker = event.type === "session.input_transcript.delta" ? "user"
    : event.type === "session.output_transcript.delta" ? "assistant" : null;
  if (!speaker) return null;
  const result = fragmentSchema.safeParse({
    eventId: event.event_id, speaker, text: event.delta, startMs: event.start_ms, endMs: event.end_ms,
  });
  return result.success ? result.data : null;
}
