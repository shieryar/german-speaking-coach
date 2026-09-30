import { z } from "zod";
import type { TranscriptFragment } from "./live";
import { missionById, type Difficulty } from "./scenarios";

export type Turn = { turn_index: number; speaker: "user" | "assistant"; text: string; start_ms: number; end_ms: number };
export function groupTurns(fragments: TranscriptFragment[]): Turn[] {
  const turns: Turn[] = [];
  for (const fragment of fragments) {
    if (!fragment.text) continue;
    const previous = turns.at(-1);
    if (previous?.speaker === fragment.speaker) {
      previous.text += fragment.text;
      previous.end_ms = fragment.endMs;
    } else turns.push({ turn_index: turns.length, speaker: fragment.speaker, text: fragment.text, start_ms: Math.floor(fragment.startMs), end_ms: Math.floor(fragment.endMs) });
  }
  return turns;
}

const objectiveSchema = z.object({ objective_index: z.number().int(), complete: z.boolean(), learner_turn_index: z.number().int().nullable(), evidence: z.string().optional() });
const improvementSchema = z.object({ turn_index: z.number().int(), original: z.string().min(1), correction: z.string().min(1), natural_alternative: z.string().nullable(), explanation: z.string().min(1), category: z.string().min(1), certainty: z.enum(["clear_error", "uncertain_transcript", "optional_style"]), preceding_prompt: z.string().optional() });
const vocabularySchema = z.object({ turn_index: z.number().int(), expression: z.string().min(1), meaning: z.string().min(1), article: z.string().nullable(), plural: z.string().nullable(), usage_pattern: z.string().nullable(), example: z.string().min(1) });
const practiceEvidenceSchema = z.object({ kind: z.enum(["target", "vocabulary"]), id: z.string().uuid(), turn_index: z.number().int(), result: z.enum(["assisted", "independent"]) });
export const reviewSchema = z.object({
  objectives: z.array(objectiveSchema), language_summary: z.string(), improvements: z.array(improvementSchema),
  vocabulary: z.array(vocabularySchema), practice_evidence: z.array(practiceEvidenceSchema),
});
export type Review = z.infer<typeof reviewSchema>;

export function validatedReview(raw: unknown, missionId: string, turns: Turn[], targetIds: string[] = [], vocabIds: string[] = []): Review {
  const parsed = reviewSchema.parse(raw);
  const mission = missionById[missionId];
  if (!mission) throw new Error("Unknown mission.");
  const learner = new Map(turns.filter((turn) => turn.speaker === "user").map((turn) => [turn.turn_index, turn]));
  const objectives = mission.objectives.map((_, objective_index) => {
    const candidate = parsed.objectives.find((item) => item.objective_index === objective_index);
    const complete = Boolean(candidate?.complete && candidate.learner_turn_index !== null && learner.has(candidate.learner_turn_index));
    return { objective_index, complete, learner_turn_index: complete ? candidate!.learner_turn_index : null,
      evidence: complete ? learner.get(candidate!.learner_turn_index!)!.text : "" };
  });
  const improvements = parsed.improvements.filter((item) =>
    item.certainty === "clear_error" && learner.has(item.turn_index) &&
    learner.get(item.turn_index)!.text.trim() === item.original.trim() &&
    item.correction.trim() !== item.original.trim()
  ).slice(0, 3).map((item) => ({ ...item, preceding_prompt: turns.slice(0, item.turn_index).reverse().find((turn) => turn.speaker === "assistant")?.text || "" }));
  const vocabulary = parsed.vocabulary.filter((item) => learner.has(item.turn_index)).slice(0, 4);
  const practice_evidence = parsed.practice_evidence.filter((item) =>
    learner.has(item.turn_index) && (item.kind === "target" ? targetIds.includes(item.id) : vocabIds.includes(item.id))
  );
  return { objectives, language_summary: parsed.language_summary, improvements, vocabulary, practice_evidence };
}

export function nextReview(result: "recognised" | "assisted" | "independent" | "later_independent" | "needs_work", stage: number, now = new Date()) {
  const nextStage = result === "assisted" || result === "needs_work" ? Math.max(0, stage - 1) : Math.min(5, stage + 1);
  const days = result === "needs_work" ? 1 : result === "assisted" ? 2 : result === "recognised" ? 3 : [1, 3, 7, 14, 30, 60][nextStage];
  return { review_stage: nextStage, next_review_at: new Date(now.getTime() + days * 86_400_000).toISOString() };
}

export function selectFocus<T extends { next_review_at: string; tags?: string[] }>(items: T[], missionId: string, limit: number, now = new Date()): T[] {
  const tags = missionById[missionId]?.tags || [];
  return items.filter((item) => new Date(item.next_review_at) <= now && (!item.tags?.length || item.tags.some((tag) => tags.includes(tag))))
    .sort((a, b) => {
      const match = (item: T) => item.tags?.some((tag) => tags.includes(tag)) ? 1 : 0;
      return match(b) - match(a) || a.next_review_at.localeCompare(b.next_review_at);
    }).slice(0, limit);
}

export function missionInstructions(missionId: string, difficulty: Difficulty, targets: { category: string; correction: string }[] = [], vocabulary: { expression: string; meaning: string }[] = [], retry?: { prompt: string; original: string }) {
  const mission = missionById[missionId];
  if (!mission) throw new Error("Unknown mission.");
  if (retry) return `You are recreating a short German role-play prompt for a retry, not replaying original audio. Say a brief German introduction and recreate this preceding prompt in your own words: "${retry.prompt}". The learner previously said: "${retry.original}". Wait for their new spoken answer. Give one concise, supportive point of feedback, accept valid alternative wording, and invite another attempt if useful. Do not claim this is an original recording. Use language around ${difficulty} level.`;
  return `You are the ${mission.aiRole} in a German speaking role-play. The learner is the ${mission.learnerRole}. Situation: ${mission.situation} Adapt your German to approximately ${difficulty} difficulty; this is practice, not a certified CEFR assessment. Stay in character, speak clear Standard German, keep turns short and ask one question at a time. Create natural chances for the learner to achieve these objectives: ${mission.objectives.join(" ")} ${mission.complications[difficulty] ? `If suitable, add this complication: ${mission.complications[difficulty]}` : ""} Do not reveal complete answers or correct every sentence. If the learner asks for a hint, offer a brief clue rather than a full answer. Gently create opportunities to practise these prior weaknesses: ${targets.map((item) => item.category + " (" + item.correction + ")").join("; ") || "none selected"}. Create natural chances to use these due expressions, preferably without saying the target expression first: ${vocabulary.map((item) => item.expression + " = " + item.meaning).join("; ") || "none selected"}. Start with a brief in-character greeting and question. Do not perform external tasks.`;
}
