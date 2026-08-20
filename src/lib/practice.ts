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
      content: `You are a German B1/B2 job communication speaking coach for a professional in Switzerland. Focus on workplace, interviews, emails, meetings, and professional self-presentation. Mode: ${modeText}.\n\nReturn only valid JSON with exactly these keys: transcript, corrected, betterVersion, explanation, tutorReply, mistakes. mistakes must be an array of objects with topic, note, example.\n\nRules:\n- Keep explanations short and practical, in English.\n- Correct the user's German without shaming.\n- betterVersion should sound natural and professional.\n- tutorReply must be in German and should continue the scenario.\n- For strict tutor mode, tutorReply should ask the user to repeat or improve the corrected sentence before continuing.\n- For conversation first mode, briefly correct then continue the conversation naturally.`,
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
