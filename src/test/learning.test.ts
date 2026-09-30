import { describe, expect, it } from "vitest";
import { groupTurns, missionInstructions, nextReview, selectFocus, validatedReview } from "@/lib/learning";
import type { TranscriptFragment } from "@/lib/live";

const fragments: TranscriptFragment[] = [
  { eventId: "a", speaker: "assistant", text: "Was kostet die Wohnung?", startMs: 0, endMs: 100 },
  { eventId: "u1", speaker: "user", text: "Gestern ich bin ", startMs: 101, endMs: 200 },
  { eventId: "u2", speaker: "user", text: "hier gewesen.", startMs: 200, endMs: 300 },
  { eventId: "a2", speaker: "assistant", text: "Und die Miete?", startMs: 301, endMs: 400 },
  { eventId: "u3", speaker: "user", text: "Wie viel kostet die Miete?", startMs: 401, endMs: 500 },
];
const turns = groupTurns(fragments);
const base = {
  objectives: [{ objective_index: 0, complete: true, learner_turn_index: 4 }, { objective_index: 1, complete: true, learner_turn_index: 2 }],
  language_summary: "You asked about rent clearly.",
  improvements: [
    { turn_index: 1, original: "Gestern ich bin hier gewesen.", correction: "Gestern bin ich hier gewesen.", natural_alternative: null, explanation: "The verb comes second.", category: "verb position", certainty: "clear_error" },
    { turn_index: 3, original: "Wie viel kostet die Miete?", correction: "Was kostet die Miete?", natural_alternative: null, explanation: "Optional.", category: "style", certainty: "optional_style" },
    { turn_index: 1, original: "uncertain", correction: "other", natural_alternative: null, explanation: "Bad transcript.", category: "case", certainty: "clear_error" },
  ],
  vocabulary: [],
  practice_evidence: [],
};
describe("learning evidence and schedule", () => {
  it("groups streaming fragments without changing the learner's wording", () => {
    expect(turns).toHaveLength(4);
    expect(turns[1]).toMatchObject({ speaker: "user", text: "Gestern ich bin hier gewesen.", start_ms: 101, end_ms: 300 });
  });
  it("accepts mission completion only when anchored to a learner turn and filters optional or uncertain corrections", () => {
    const review = validatedReview(base, "apartment-viewing", turns);
    expect(review.objectives[0]).toMatchObject({ complete: false, learner_turn_index: null });
    expect(review.objectives[1]).toMatchObject({ complete: false, learner_turn_index: null });
    expect(review.improvements).toHaveLength(1);
    expect(review.improvements[0].preceding_prompt).toBe("Was kostet die Wohnung?");
    expect(review.improvements[0].correction).toBe("Gestern bin ich hier gewesen.");
    const valid = validatedReview({ ...base, objectives: [{ objective_index: 0, complete: true, learner_turn_index: 3 }] }, "apartment-viewing", turns);
    expect(valid.objectives[0]).toMatchObject({ complete: true, evidence: "Wie viel kostet die Miete?" });
  });
  it("reviews assisted use earlier than repeated independent success", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(nextReview("assisted", 3, now)).toEqual({ review_stage: 2, next_review_at: "2026-01-03T00:00:00.000Z" });
    expect(nextReview("independent", 3, now)).toEqual({ review_stage: 4, next_review_at: "2026-01-31T00:00:00.000Z" });
    expect(nextReview("needs_work", 0, now).next_review_at).toBe("2026-01-02T00:00:00.000Z");
  });
  it("selects due scenario vocabulary, never future items, and prompts for opportunities without revealing answers", () => {
    const items = [
      { expression: "die Miete", meaning: "rent", tags: ["housing"], next_review_at: "2025-12-30" },
      { expression: "der Rückgabe", meaning: "return", tags: ["shopping"], next_review_at: "2025-12-01" },
      { expression: "später", meaning: "later", tags: [], next_review_at: "2027-01-01" },
    ];
    expect(selectFocus(items, "apartment-viewing", 1, new Date("2026-01-01"))[0].expression).toBe("die Miete");
    expect(selectFocus(items, "apartment-viewing", 3, new Date("2026-01-01"))).toHaveLength(1);
    const prompt = missionInstructions("apartment-viewing", "B1", [{ category: "verb position", correction: "Gestern bin ich..." }], [items[0]]);
    expect(prompt).toContain("verb position");
    expect(prompt).toContain("preferably without saying the target expression first");
  });
});
