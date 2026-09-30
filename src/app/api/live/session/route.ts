import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOpenAiKey } from "@/lib/openai";
import { db, serverUser } from "@/lib/backend";
import { difficultyLevels, missionById, type Difficulty } from "@/lib/scenarios";
import { missionInstructions, selectFocus } from "@/lib/learning";

export const runtime = "nodejs";
const requestSchema = z.object({
  sdp: z.string().min(1).max(60_000).refine((value) => value.trim().length > 0),
  missionId: z.string().refine((value) => Object.hasOwn(missionById, value)),
  difficulty: z.enum(difficultyLevels),
  sessionId: z.string().uuid(),
  retainTranscript: z.boolean(),
  retry: z.object({ sourceSessionId: z.string().uuid(), turnIndex: z.number().int().nonnegative(), prompt: z.string().max(1000), original: z.string().max(1000) }).optional(),
});
type Target = { id: string; category: string; correction: string; next_review_at: string };
type Vocab = { id: string; expression: string; meaning: string; tags: string[]; next_review_at: string };

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Open this conversation from the app." }, { status: 403 });
  const raw = await request.text();
  if (raw.length > 65_536) return NextResponse.json({ error: "Session request is too large." }, { status: 413 });
  let body;
  try { body = requestSchema.safeParse(JSON.parse(raw)); } catch { return NextResponse.json({ error: "Invalid session request." }, { status: 400 }); }
  if (!body.success) return NextResponse.json({ error: "A valid connection offer, mission and level are required." }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Set OPENAI_API_KEY on the server." }, { status: 503 });
  let user;
  try { user = await serverUser(request); } catch { return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 }); }
  if (!user) return NextResponse.json({ error: "Learning session unavailable. Reload the page and try again." }, { status: 401 });
  const { missionId, difficulty, retry, sessionId, retainTranscript } = body.data;
  try {
    if (retry) {
      const source = await db<{ id: string }[]>(`sessions?id=eq.${retry.sourceSessionId}&select=id`, { token: user.token });
      if (!source.length) return NextResponse.json({ error: "The source session is unavailable." }, { status: 404 });
    }
    const [targets, vocab] = await Promise.all([
      db<Target[]>("learning_targets?dismissed=eq.false&select=id,category,correction,next_review_at&order=next_review_at.asc&limit=30", { token: user.token }),
      db<Vocab[]>("vocabulary?select=id,expression,meaning,tags,next_review_at&order=next_review_at.asc&limit=50", { token: user.token }),
    ]);
    const focusTargets = selectFocus(targets, missionId, 3);
    const focusVocab = selectFocus(vocab, missionId, 3);
    if (!retry) {
      await db("sessions?on_conflict=id", { method: "POST", token: user.token, prefer: "resolution=ignore-duplicates,return=representation",
        body: { id: sessionId, user_id: user.id, mission_id: missionId, difficulty, retain_transcript: retainTranscript,
          focus_target_ids: focusTargets.map((item) => item.id), focus_vocab_ids: focusVocab.map((item) => item.id) } });
    }
    const response = await fetch("https://api.openai.com/v1/live/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${requireOpenAiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        session: {
          model: "gpt-live-1", store: false,
          instructions: missionInstructions(missionId, difficulty as Difficulty, focusTargets, focusVocab, retry),
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
        : response.status === 400 || response.status === 422 ? "The Live service rejected the connection setup. Refresh the page and retry."
        : "Could not create a Live session. Please try again.";
      return NextResponse.json({ error: message }, { status: response.status === 429 ? 429 : 502 });
    }
    const data = await response.json();
    if (typeof data.session?.id !== "string" || typeof data.transport?.sdp !== "string") throw new Error("Invalid answer");
    if (!retry) await db(`sessions?id=eq.${sessionId}`, { method: "PATCH", token: user.token, body: { status: "live" } });
    return NextResponse.json({ session: { id: data.session.id }, transport: { type: "webrtc", sdp: data.transport.sdp } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Live connection could not be established. Check your setup and connection, then retry." }, { status: 502 });
  }
}
