"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import AuthGate from "@/app/components/AuthGate";
import RetryPanel from "@/app/components/RetryPanel";
import SiteNav from "@/app/components/SiteNav";
import Transcript from "@/app/components/Transcript";
import { appPost, db } from "@/lib/backend";
import { groupTurns, type Review, type Turn } from "@/lib/learning";
import type { TranscriptFragment } from "@/lib/live";
import { LiveConnection, type LiveStatus } from "@/lib/liveConnection";
import { difficultyLevels, missionById, missions, type Difficulty } from "@/lib/scenarios";

export default function LivePage() { return <AuthGate>{() => <Conversation />}</AuthGate>; }

function Conversation() {
  const [missionId, setMissionId] = useState("apartment-viewing");
  const [difficulty, setDifficulty] = useState<Difficulty>("B1");
  const [retain, setRetain] = useState(false);
  const [ready, setReady] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [fragments, setFragments] = useState<TranscriptFragment[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [showTranscript, setShowTranscript] = useState(true);
  const [hint, setHint] = useState("");
  const [error, setError] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [retryIndex, setRetryIndex] = useState<number | null>(null);
  const [momentBusy, setMomentBusy] = useState(false);
  const [momentSuggestion, setMomentSuggestion] = useState<{ correction: string; alternative: string | null; explanation: string } | null>(null);
  const [selectedTurn, setSelectedTurn] = useState(-1);
  const [blocked, setBlocked] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const connection = useRef<LiveConnection | null>(null);
  const fragmentRef = useRef<TranscriptFragment[]>([]);
  const sessionId = useRef("");
  const startedAt = useRef(0);
  const hintAfterTurns = useRef<number[]>([]);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const busy = useRef(false);
  const reviewed = useRef(false);
  const active = ["connecting", "live", "ending"].includes(status);
  const mission = missionById[missionId] || missions[0];
  const turns = groupTurns(fragments);
  const learnerTurns = turns.filter((turn) => turn.speaker === "user");
  const retryTurn = retryIndex === null ? null : turns[retryIndex];
  const previousPrompt = retryIndex === null ? "" : turns.slice(0, retryIndex).reverse().find((turn) => turn.speaker === "assistant")?.text || "";
  const improvement = review?.improvements.find((item) => item.turn_index === retryIndex);

  useEffect(() => {
    alive.current = true;
    const initialize = setTimeout(() => {
      const query = new URLSearchParams(window.location.search);
      const id = query.get("mission");
      if (id && missionById[id]) {
        setMissionId(id);
        setDifficulty(missionById[id].defaultLevel);
      }
      const level = query.get("level");
      if (difficultyLevels.includes(level as Difficulty)) setDifficulty(level as Difficulty);
      if (query.has("retain")) setRetain(query.get("retain") === "1");
      setReady(true);
    }, 0);
    const leave = () => { connection.current?.dispose(); };
    window.addEventListener("pagehide", leave);
    return () => { alive.current = false; clearTimeout(initialize); window.removeEventListener("pagehide", leave); connection.current?.dispose(); if (persistTimer.current) clearTimeout(persistTimer.current); };
  }, []);
  useEffect(() => {
    if (status !== "live") return;
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [status]);

  const saveTurns = useCallback(async () => {
    if (!retain || !sessionId.current || !fragmentRef.current.length) return;
    const items = groupTurns(fragmentRef.current);
    try {
      await db("transcript_turns?on_conflict=session_id,turn_index", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
        body: items.map((turn) => ({ ...turn, session_id: sessionId.current })) });
    } catch (err) { if (alive.current) setError(err instanceof Error ? `Transcript save failed: ${err.message}` : "Transcript save failed."); }
  }, [retain]);
  const analyse = useCallback(async () => {
    if (reviewed.current || !sessionId.current || !fragmentRef.current.length) return;
    reviewed.current = true; setReviewBusy(true);
    try {
      await saveTurns();
      const result = await appPost<{ review: Review }>("/api/review", { sessionId: sessionId.current, turns: groupTurns(fragmentRef.current), hintAfterTurns: hintAfterTurns.current });
      if (alive.current) setReview(result.review);
    } catch (err) {
      reviewed.current = false;
      if (alive.current) setError(err instanceof Error ? `Review failed: ${err.message}` : "Review failed. Try again.");
    } finally { if (alive.current) setReviewBusy(false); }
  }, [saveTurns]);

  function start() {
    if (busy.current || !ready || !audio.current) return;
    busy.current = true; reviewed.current = false;
    connection.current?.dispose();
    sessionId.current = crypto.randomUUID();
    setActiveSessionId(sessionId.current);
    fragmentRef.current = []; hintAfterTurns.current = []; startedAt.current = 0;
    setFragments([]); setSeconds(0); setMuted(false); setHint(""); setError(""); setReview(null); setBlocked(false); setRetryIndex(null);
    const instance = new LiveConnection(audio.current, {
      status(next) {
        if (!alive.current || connection.current !== instance) return;
        if (next === "live") startedAt.current = Date.now();
        if (next === "ended" || next === "error") {
          busy.current = false;
          if (startedAt.current) setSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
          startedAt.current = 0;
          void saveTurns();
          if (next === "ended") void analyse();
        }
        setStatus(next);
      },
      fragment(fragment) {
        if (!alive.current || connection.current !== instance) return;
        fragmentRef.current = [...fragmentRef.current, fragment];
        setFragments(fragmentRef.current);
        if (retain) {
          if (persistTimer.current) clearTimeout(persistTimer.current);
          persistTimer.current = setTimeout(() => void saveTurns(), 1200);
        }
      },
      error(message) { if (alive.current && connection.current === instance) setError(message); },
      playbackBlocked(value) { if (alive.current && connection.current === instance) setBlocked(value); },
    });
    connection.current = instance;
    void instance.start({ missionId, difficulty, sessionId: sessionId.current, retainTranscript: retain });
  }
  function showHint() {
    const next = review?.objectives.find((item) => !item.complete)?.objective_index ?? Math.min(learnerTurns.length, mission.objectives.length - 1);
    setHint(`Try to ${mission.objectives[next].replace(/\.$/, "").toLowerCase()} in your own words. Ask one short question or make one clear statement.`);
    hintAfterTurns.current.push(Math.max(0, turns.length - 1));
  }
  async function openRetry(index: number) {
    const original = turns[index]?.text;
    const prompt = turns.slice(0, index).reverse().find((turn) => turn.speaker === "assistant")?.text || "";
    if (!original) return;
    setMomentBusy(true); setMomentSuggestion(null);
    try {
      const result = await appPost<{ correction: string; alternative: string | null; explanation: string }>("/api/moment",
        { sessionId: sessionId.current, turnIndex: index, original, prompt });
      setMomentSuggestion(result);
    } catch (err) { setError(err instanceof Error ? `Suggestion unavailable: ${err.message}` : "Suggestion unavailable."); }
    finally { setMomentBusy(false); }
    connection.current?.mute(true);
    audio.current?.pause();
    setRetryIndex(index);
  }
  function closeRetry() {
    setRetryIndex(null);
    if (status === "live") {
      connection.current?.mute(muted);
      if (!muted) void connection.current?.play();
    }
  }
  return <main className="siteShell liveScreen">
    <SiteNav current="live" />
    <header className="pageHeader"><span className="sectionIndex">LIVE ROLE-PLAY</span><h1>{mission.title}</h1><p>You are the {mission.learnerRole}. The coach is the {mission.aiRole}.</p></header>
    <div className="workspaceStack">
      <section className="panel liveControls" aria-label="Conversation controls">
        <div className="controlsGrid">
          <div><span className="sectionIndex">01 / SPEAK</span><h2>Conversation controls</h2>
            <p className="privacyNote">Starting asks for microphone permission. Your voice is streamed to OpenAI; raw audio is not stored by this app. {retain ? "Your transcript will be saved to your learning space." : "Your full transcript will not be retained after review."}</p>
            <p className="billingNote">API voice usage is billed separately from ChatGPT Plus. Ending the session closes the paid connection.</p>
          </div>
          <div className="liveButtons">
            <button className="record" disabled={active || !ready} onClick={start}><span className="buttonMic" aria-hidden="true">●</span>{status === "ended" || status === "error" ? "Start new mission session" : "Start conversation"}<span>↗</span></button>
            <div className="secondaryButtons"><button className="ghost" disabled={status !== "live" || retryIndex !== null} onClick={() => { connection.current?.mute(!muted); setMuted(!muted); }}>{muted ? "Unmute microphone" : "Mute microphone"}</button>
              <button className="ghost" disabled={!active || status === "ending"} onClick={() => void connection.current?.end()}>End session</button></div>
            <div className="sessionStatus" role="status"><span className={`statusDot ${status === "live" ? "statusDotLive" : ""}`} />{statusLabels[status]}<span className="sessionTimer">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span></div>
            {blocked && <button className="ghost" onClick={() => void connection.current?.play()}>Play coach audio</button>}
            {error && <p role="alert" className="errorBox">{error}</p>}
          </div>
        </div>
      </section>
      <div className="conversationGrid">
        <section className="panel objectivePanel" aria-label="Mission objectives"><span className="sectionIndex">02 / OBJECTIVES</span><h2>Your checklist</h2>
          <p>Completion is checked from your turns in the session review.</p>
          <ul className="objectiveList">{mission.objectives.map((objective, index) => <li key={objective}><span aria-hidden="true">{review?.objectives[index]?.complete ? "✓" : "○"}</span>{objective}</li>)}</ul>
          <button className="ghost" disabled={status !== "live"} onClick={showHint}>Give me a hint</button>
          {hint && <p className="hintBox">{hint}</p>}
          <div className="retryPicker"><label htmlFor="retryTurn">Difficult moment</label><select id="retryTurn" value={selectedTurn} onChange={(event) => setSelectedTurn(Number(event.target.value))}>
            <option value={-1}>Choose one of your turns</option>{learnerTurns.slice(-8).map((turn) => <option key={turn.turn_index} value={turn.turn_index}>{turn.text.slice(0, 72)}</option>)}
          </select><button className="ghost" disabled={selectedTurn < 0 || !activeSessionId || retryIndex !== null || momentBusy} onClick={() => void openRetry(selectedTurn)}>{momentBusy ? "Preparing moment…" : "Practise that moment"}</button></div>
        </section>
        <div className="transcriptColumn"><button className="textButton" onClick={() => setShowTranscript(!showTranscript)}>{showTranscript ? "Hide" : "Show"} transcript</button>
          {showTranscript && <Transcript fragments={fragments} autoScroll />}
          <p className="transcriptNote">Recognition can be uncertain. The coach&apos;s text may include speech you interrupted; no pronunciation judgment is made from text.</p></div>
      </div>
      {retryTurn && <RetryPanel missionId={missionId} difficulty={difficulty} sourceSessionId={activeSessionId} turnIndex={retryTurn.turn_index}
        original={retryTurn.text} prompt={previousPrompt} correction={improvement?.correction || momentSuggestion?.correction}
        alternative={improvement?.natural_alternative || momentSuggestion?.alternative} explanation={improvement?.explanation || momentSuggestion?.explanation} onClose={closeRetry} />}
      {(status === "ended" || status === "error") && fragments.length > 0 && <section className="panel outcomePanel">
        <h2>Session review</h2>{reviewBusy && <p>Checking your objectives and language use…</p>}
        {review ? <><p>{review.objectives.filter((item) => item.complete).length} of {mission.objectives.length} objectives completed based on your turns.</p><p>{review.language_summary}</p>
          <Link className="record startLink" href={`/review?id=${activeSessionId}`}>Open full review <span>↗</span></Link></>
          : !reviewBusy && <button className="ghost" onClick={() => void analyse()}>Review captured conversation</button>}</section>}
    </div>
    <audio ref={audio} autoPlay playsInline />
  </main>;
}
const statusLabels: Record<LiveStatus, string> = { idle: "Ready", connecting: "Connecting…", live: "Connected", ending: "Ending…", ended: "Session ended", error: "Connection error" };
