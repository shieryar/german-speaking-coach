import { describe, expect, it } from "vitest";
import { buildPracticeMessages, parsePracticeResponse } from "@/lib/practice";

describe("buildPracticeMessages", () => {
  it("creates a B1/B2 job communication strict tutor prompt", () => {
    const messages = buildPracticeMessages({ mode: "strict", scenario: "job-interview", transcript: "Ich bin verantwortlich für entwickeln Power Apps." });
    const all = messages.map((m) => m.content).join("\n");
    expect(all).toContain("B1/B2");
    expect(all).toContain("job communication");
    expect(all).toContain("strict tutor");
    expect(all).toContain("Ich bin verantwortlich");
    expect(all).toContain("valid JSON");
  });

  it("treats correct spoken German as correct and puts valid variants only in betterVersion", () => {
    const messages = buildPracticeMessages({
      mode: "conversation",
      scenario: "workplace-small-talk",
      transcript: "Hallo wie geht es Ihnen? Ist Alles gut?",
    });
    const all = messages.map((message) => message.content).join("\n");

    expect(all).toContain("Do not replace one grammatically correct expression with another");
    expect(all).toContain("speech-to-text punctuation or capitalization");
    expect(all).toContain("Hallo, wie geht es Ihnen? Ist alles gut?");
    expect(all).toContain("Hallo, wie geht es Ihnen? Alles gut?");
    expect(all).toContain('assessment must be "correct"');
  });
});

describe("parsePracticeResponse", () => {
  it("keeps valid correction fields", () => {
    const parsed = parsePracticeResponse(JSON.stringify({
      transcript: "Ich arbeite mit mein Manager.",
      assessment: "needs-correction",
      corrected: "Ich arbeite mit meinem Manager.",
      betterVersion: "Ich stimme mich regelmäßig mit meinem Manager ab.",
      explanation: "Nach mit steht der Dativ.",
      tutorReply: "Sehr gut. Woran arbeiten Sie aktuell?",
      mistakes: [{ topic: "Dativ", note: "mit + Dativ", example: "mit meinem Manager" }]
    }));
    expect(parsed.assessment).toBe("needs-correction");
    expect(parsed.corrected).toContain("meinem Manager");
    expect(parsed.mistakes[0].topic).toBe("Dativ");
  });
});
