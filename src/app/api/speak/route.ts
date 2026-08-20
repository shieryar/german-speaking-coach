import { NextRequest, NextResponse } from "next/server";
import { requireOpenAiKey } from "@/lib/openai";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();
    if (!text?.trim()) return NextResponse.json({ error: "Text is required" }, { status: 400 });

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${requireOpenAiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
        voice: process.env.OPENAI_TTS_VOICE || "alloy",
        input: text,
        instructions: "Speak clear standard German at a calm B1/B2 learning pace.",
        format: "mp3",
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    const audio = await response.arrayBuffer();
    return new NextResponse(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
