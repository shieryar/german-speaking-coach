// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/review/route";
import { db, serverUser } from "@/lib/backend";
import type { Review } from "@/lib/learning";

vi.mock("@/lib/backend", () => ({ db: vi.fn(), serverUser: vi.fn() }));
const sessionId = "d843997e-7160-47ae-ae20-5536c7b8589e";
const userId = "535937d2-251b-4900-b24d-566690253222";
const targetId = "ee67b180-c784-4c69-ae67-dbb3513cd3d2";
let storedReview: Review | null;
let targetInserted: boolean;
let occurrenceInserted: boolean;
const review = {
  objectives: [{ objective_index: 0, complete: true, learner_turn_index: 1 }],
  language_summary: "You asked about rent.",
  improvements: [{ turn_index: 1, original: "Gestern ich bin hier.", correction: "Gestern bin ich hier.", natural_alternative: null,
    explanation: "Finite verb second.", category: "verb position", certainty: "clear_error" }],
  vocabulary: [], practice_evidence: [],
};
const turns = [
  { turn_index: 0, speaker: "assistant", text: "Was möchten Sie wissen?", start_ms: 0, end_ms: 100 },
  { turn_index: 1, speaker: "user", text: "Gestern ich bin hier.", start_ms: 101, end_ms: 200 },
];

beforeEach(() => {
  storedReview = null; targetInserted = false; occurrenceInserted = false;
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.mocked(serverUser).mockResolvedValue({ id: userId, token: "jwt" });
  vi.mocked(db).mockImplementation(async (query: string, options?: { method?: string; body?: unknown }) => {
    if (query.startsWith("sessions?id=") && (!options?.method || options.method === "GET"))
      return [{ id: sessionId, mission_id: "apartment-viewing", difficulty: "B1", retain_transcript: true, review: storedReview,
        focus_target_ids: [], focus_vocab_ids: [] }] as never;
    if (query.startsWith("sessions?id=") && options?.method === "PATCH") {
      const body = options.body as { review?: Review };
      if (body.review) storedReview = body.review;
      return [] as never;
    }
    if (query.startsWith("learning_targets?fingerprint=")) return (targetInserted ? [{ id: targetId, occurrence_count: 1 }] : []) as never;
    if (query.startsWith("learning_targets?on_conflict=")) {
      if (targetInserted) return [] as never;
      targetInserted = true; return [{ id: targetId, occurrence_count: 1 }] as never;
    }
    if (query.startsWith("learning_target_occurrences?on_conflict=")) {
      if (occurrenceInserted) return [] as never;
      occurrenceInserted = true; return [{ target_id: targetId }] as never;
    }
    if (query.startsWith("learning_target_occurrences?target_id=")) return [{ target_id: targetId }] as never;
    return [] as never;
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(review) }] }] }))));
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const request = () => new NextRequest("https://coach.test/api/review", {
  method: "POST", headers: { origin: "https://coach.test", authorization: "Bearer jwt" },
  body: JSON.stringify({ sessionId, turns, hintAfterTurns: [] }),
});

it("persists a clear correction and evidence-backed mission review once across repeated requests", async () => {
  const first = await POST(request());
  expect(first.status).toBe(200);
  const firstReview = (await first.json()).review as Review;
  expect(firstReview.objectives[0]).toMatchObject({ complete: true, evidence: "Gestern ich bin hier." });
  expect(firstReview.improvements).toHaveLength(1);
  expect(vi.mocked(db).mock.calls.filter(([query]) => query.startsWith("learning_targets?on_conflict="))).toHaveLength(1);
  const second = await POST(request());
  expect(second.status).toBe(200);
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(db).mock.calls.filter(([query]) => query.startsWith("learning_targets?on_conflict="))).toHaveLength(1);
});

it("rejects a missing user before analysis or persistence", async () => {
  vi.mocked(serverUser).mockResolvedValueOnce(null);
  expect((await POST(request())).status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});
