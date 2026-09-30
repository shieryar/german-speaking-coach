"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { appPost } from "@/lib/backend";
import { groupTurns } from "@/lib/learning";
import type { TranscriptFragment } from "@/lib/live";
import { LiveConnection, type LiveStatus } from "@/lib/liveConnection";
import type { Difficulty } from "@/lib/scenarios";
import Transcript from "./Transcript";

type Props = { missionId: string; difficulty: Difficulty; sourceSessionId: string; turnIndex: number; original: string;
  prompt: string; correction?: string; alternative?: string | null; explanation?: string; onClose: () => void };

export default function RetryPanel(props: Props) {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [fragments, setFragments] = useState<TranscriptFragment[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [usedHelp, setUsedHelp] = useState(false);
  const [assisted, setAssisted] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const connection = useRef<LiveConnection | null>(null);
  const fragmentRef = useRef<TranscriptFragment[]>([]);
  const assistedRef = useRef(false);
  const evaluating = useRef(false);
  const attemptId = useRef(crypto.randomUUID());
  const active = status === "connecting" || status === "live" || status === "ending";
  const attempt = useMemo(() => groupTurns(fragments).filter((turn) => turn.speaker === "user").at(-1)?.text || "", [fragments]);

  useEffect(() => () => { connection.current?.dispose(); }, []);
  async function evaluate() {
    if (evaluating.current) return;
    const text = groupTurns(fragmentRef.current).filter((turn) => turn.speaker === "user").at(-1)?.text?.trim();
    if (!text) { setError("No spoken answer was captured. Try another attempt."); return; }
    evaluating.current = true; setBusy(true);
    try {
      const result = await appPost<{ valid: boolean; feedback: string }>("/api/retry", {
        sourceSessionId: props.sourceSessionId, turnIndex: props.turnIndex, original: props.original,
        correction: props.correction || "", attempt: text, assisted: assistedRef.current, attemptId: attemptId.current,
      });
      setFeedback(result.feedback);
    } catch (err) { setError(err instanceof Error ? err.message : "Feedback failed. Try again."); evaluating.current = false; }
    finally { setBusy(false); }
  }
  function start() {
    if (!audio.current || active) return;
    connection.current?.dispose();
    fragmentRef.current = []; attemptId.current = crypto.randomUUID(); evaluating.current = false;
    setFragments([]); setFeedback(""); setError(""); setBlocked(false); setAssisted(usedHelp); assistedRef.current = usedHelp; setRevealed(false); setUsedHelp(false);
    const instance = new LiveConnection(audio.current, {
      status(next) { if (connection.current !== instance) return; setStatus(next); if (next === "ended") void evaluate(); },
      fragment(fragment) { if (connection.current !== instance) return; fragmentRef.current = [...fragmentRef.current, fragment]; setFragments(fragmentRef.current); },
      error(message) { if (connection.current === instance) setError(message); },
      playbackBlocked(value) { setBlocked(value); },
    });
    connection.current = instance;
    void instance.start({ missionId: props.missionId, difficulty: props.difficulty, sessionId: crypto.randomUUID(),
      retainTranscript: false, retry: { sourceSessionId: props.sourceSessionId, turnIndex: props.turnIndex, prompt: props.prompt, original: props.original } });
  }
  return <section className="panel retryPanel" aria-label="Practise that moment">
    <div className="panelHeading"><span className="sectionIndex">PRACTISE THAT MOMENT</span><h2>Try it again</h2>
      <p>The coach will recreate the prompt. This is new audio, not the original recording. A voice retry starts another billed API session.</p></div>
    <div className="retryContext"><p><strong>Coach said:</strong> {props.prompt || "The preceding coach prompt was not captured."}</p>
      <p><strong>You said:</strong> <span lang="de">{props.original}</span></p>
      {!active && props.correction && <button className="ghost" onClick={() => { if (!revealed) setUsedHelp(true); setRevealed(!revealed); }}>{revealed ? "Hide suggestion" : "Show suggested answer"}</button>}
      {revealed && !active && <div className="hintBox"><p lang="de">{props.correction}</p>{props.alternative && <p>Another natural option: <span lang="de">{props.alternative}</span></p>}{props.explanation && <p>{props.explanation}</p>}</div>}
      {!props.correction && props.explanation && <p className="hintBox">{props.explanation}</p>}
    </div>
    <div className="retryActions">
      <button className="record" disabled={active || busy} onClick={start}>{status === "idle" ? "Start voice retry" : "Try again by voice"}</button>
      <button className="ghost" disabled={!active || status === "ending"} onClick={() => void connection.current?.end()}>Finish attempt</button>
      <button className="ghost" onClick={() => { connection.current?.dispose(); props.onClose(); }}>Return to mission</button>
    </div>
    {active && <p role="status">{status === "live" ? "Connected. Speak your new answer." : status === "connecting" ? "Connecting…" : "Ending…"}</p>}
    {blocked && active && <button className="ghost" onClick={() => void connection.current?.play()}>Play coach audio</button>}
    {assisted && <p className="transcriptNote">This attempt is recorded as assisted because you viewed the suggestion.</p>}
    {attempt && <Transcript fragments={fragments} />}
    {feedback && <p className="successBox">{feedback}</p>}
    {busy && <p role="status">Checking your answer…</p>}
    {error && <p role="alert" className="errorBox">{error}</p>}
    <audio ref={audio} autoPlay playsInline />
  </section>;
}
