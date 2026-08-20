import { NextRequest, NextResponse } from "next/server";
import { buildPracticeMessages, parsePracticeResponse, PracticeMode, Scenario } from "@/lib/practice";
import { openAiJson } from "@/lib/openai";

export const runtime = "nodejs";

type PracticeRequest = { mode: PracticeMode; scenario: Scenario; transcript: string; history?: string[] };

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PracticeRequest;
    if (!body.transcript?.trim()) return NextResponse.json({ error: "Transcript is required" }, { status: 400 });

    const messages = buildPracticeMessages(body);
    const data = await openAiJson("chat/completions", {
      model: process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages,
    });
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI returned no message content");
    return NextResponse.json(parsePracticeResponse(content));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
