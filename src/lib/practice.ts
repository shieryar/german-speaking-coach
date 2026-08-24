import { z } from "zod";

export type PracticeMode = "conversation" | "strict";
export type Scenario = "job-interview" | "meeting" | "email" | "workplace-small-talk" | "project-explanation";

export const scenarioLabels: Record<Scenario, string> = {
  "job-interview": "job interview",
  meeting: "work meetings",
  email: "professional email phrasing",
  "workplace-small-talk": "workplace small talk",
  "project-explanation": "explaining automation projects",
};

const MistakeSchema = z.object({
  topic: z.string(),
  note: z.string(),
  example: z.string(),
});

export const PracticeResponseSchema = z.object({
  transcript: z.string(),
  assessment: z.enum(["correct", "needs-correction"]),
  corrected: z.string(),
  betterVersion: z.string(),
  explanation: z.string(),
  tutorReply: z.string(),
  mistakes: z.array(MistakeSchema).default([]),
});

export type PracticeResponse = z.infer<typeof PracticeResponseSchema>;

export function buildPracticeMessages(input: { mode: PracticeMode; scenario: Scenario; transcript: string; history?: string[] }) {
  const modeText = input.mode === "strict" ? "strict tutor" : "conversation first";
  return [
    {
      role: "system" as const,
      content: `You are a German B1/B2 job communication speaking coach for a professional in Switzerland. Focus on workplace, interviews, emails, meetings, and professional self-presentation. Mode: ${modeText}.\n\nReturn only valid JSON with exactly these keys: transcript, assessment, corrected, betterVersion, explanation, tutorReply, mistakes. assessment must be either "correct" or "needs-correction". mistakes must be an array of objects with topic, note, example.\n\nRules:\n- Judge the learner's spoken German, not punctuation or capitalization that may have been inserted by speech recognition. Never report speech-to-text punctuation or capitalization as a learner mistake.\n- If the utterance is grammatically correct and appropriate, assessment must be "correct", corrected must preserve the learner's wording (apart from harmless punctuation/capitalization normalization), explanation must begin with "Correct." and mistakes must be empty.\n- Do not replace one grammatically correct expression with another and call it a correction. Put optional natural or professional alternatives only in betterVersion and clearly label them as alternatives in explanation.\n- If there is a genuine grammar, word-choice, or register error, assessment must be "needs-correction", corrected must contain only the necessary correction, and mistakes must list only genuine errors.\n- Both "Hallo, wie geht es Ihnen? Ist alles gut?" and "Hallo, wie geht es Ihnen? Alles gut?" are correct. Neither is a correction of the other; the other form may only be shown as an alternative.\n- Keep explanations short and practical, in English.\n- Correct the user's German without shaming.\n- betterVersion should sound natural and professional. When the original is already natural, it may equal corrected or offer a clearly optional variant.\n- tutorReply must be in German and should continue the scenario.\n- For strict tutor mode, ask the user to repeat only when assessment is "needs-correction". When assessment is "correct", acknowledge it and continue the scenario.\n- For conversation first mode, mention a correction only when assessment is "needs-correction"; otherwise acknowledge correctness and continue naturally.`,
    },
    {
      role: "user" as const,
      content: `Scenario: ${scenarioLabels[input.scenario]}\nRecent context:\n${input.history?.slice(-6).join("\n") || "No previous context."}\n\nUser transcript to correct:\n${input.transcript}`,
    },
  ];
}

export function parsePracticeResponse(raw: string): PracticeResponse {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const data = JSON.parse(cleaned);
  return PracticeResponseSchema.parse(data);
}
