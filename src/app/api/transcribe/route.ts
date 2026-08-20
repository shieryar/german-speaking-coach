import { NextRequest, NextResponse } from "next/server";
import { requireOpenAiKey } from "@/lib/openai";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File)) return NextResponse.json({ error: "Audio file is required" }, { status: 400 });

    const outbound = new FormData();
    outbound.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe");
    outbound.append("language", "de");
    outbound.append("file", audio, audio.name || "speech.webm");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${requireOpenAiKey()}` },
      body: outbound,
    });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    return NextResponse.json({ transcript: data.text || "" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
