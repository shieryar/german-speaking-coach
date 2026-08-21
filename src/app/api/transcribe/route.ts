import { NextRequest, NextResponse } from "next/server";
import { getAudioFileDiagnostics } from "@/lib/audioDiagnostics";
import { requireOpenAiKey } from "@/lib/openai";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let received: Awaited<ReturnType<typeof getAudioFileDiagnostics>> | undefined;

  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File)) return NextResponse.json({ error: "Audio file is required" }, { status: 400 });

    received = await getAudioFileDiagnostics(audio);
    const outbound = new FormData();
    outbound.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe");
    outbound.append("language", "de");
    outbound.append("file", audio, audio.name || "speech.webm");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${requireOpenAiKey()}` },
      body: outbound,
    });

    if (!response.ok) {
      const providerResponse = await response.text();
      return NextResponse.json(
        {
          error: getProviderErrorMessage(providerResponse),
          diagnostics: { received, providerStatus: response.status, providerResponse },
        },
        { status: 502 },
      );
    }

    const data = await response.json();
    return NextResponse.json({
      transcript: data.text || "",
      diagnostics: { received, providerStatus: response.status },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        diagnostics: { received },
      },
      { status: 500 },
    );
  }
}

function getProviderErrorMessage(providerResponse: string) {
  try {
    const parsed = JSON.parse(providerResponse);
    return parsed?.error?.message || providerResponse;
  } catch {
    return providerResponse;
  }
}
