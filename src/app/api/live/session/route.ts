import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOpenAiKey } from "@/lib/openai";
import { scenarioLabels, type Scenario } from "@/lib/scenarios";
import { liveInstructions } from "@/lib/live";

export const runtime = "nodejs";
const requestSchema = z.object({
  // SDP is line-oriented: preserve the browser's final CRLF for the provider parser.
  sdp: z.string().min(1).max(60_000).refine((value) => value.trim().length > 0),
  scenario: z.string().refine((value) => Object.hasOwn(scenarioLabels, value)),
});

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Please start Live Conversation from this app." }, { status: 403 });
  }
  const raw = await request.text();
  if (raw.length > 65_536) return NextResponse.json({ error: "Session request is too large." }, { status: 413 });
  let body;
  try { body = requestSchema.safeParse(JSON.parse(raw)); }
  catch { return NextResponse.json({ error: "Invalid session request." }, { status: 400 }); }
  if (!body.success) return NextResponse.json({ error: "A valid connection offer and scenario are required." }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Set OPENAI_API_KEY on the server to use Live Conversation." }, { status: 503 });
  try {
    const response = await fetch("https://api.openai.com/v1/live/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${requireOpenAiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        session: {
          model: "gpt-live-1", store: false,
          instructions: liveInstructions(body.data.scenario as Scenario),
          client: { data_channel: {
            allowed_client_events: ["session.close"],
            allowed_server_events: ["session.started", "session.closed", "session.input_transcript.delta", "session.output_transcript.delta", "error"].map((type) => ({ type })),
          } },
        },
        transport: { type: "webrtc", sdp: body.data.sdp },
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) {
      const message = response.status === 401 || response.status === 403 || response.status === 404
        ? "Live is unavailable for this API project. Check the server API key and GPT-Live-1 access."
        : response.status === 429 ? "Live capacity or API quota reached. Check billing or try again later."
        : response.status === 400 || response.status === 422 ? "The Live service rejected the connection setup. Refresh the page and start a new session."
        : "Could not create a Live session. Please try again.";
      return NextResponse.json({ error: message }, { status: response.status === 429 ? 429 : 502 });
    }
    const data = await response.json();
    if (typeof data.session?.id !== "string" || typeof data.transport?.sdp !== "string") throw new Error("Invalid answer");
    return NextResponse.json({ session: { id: data.session.id }, transport: { type: "webrtc", sdp: data.transport.sdp } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Live connection could not be established. Check your connection and try again." }, { status: 502 });
  }
}
