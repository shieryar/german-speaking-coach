"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { scenarioLabels, type Scenario } from "@/lib/practice";
import { LIVE_STORAGE_KEY, readLiveHistory, saveLiveSession, type SavedLiveSession, type TranscriptFragment } from "@/lib/live";
import { LiveConnection, type LiveStatus } from "@/lib/liveConnection";

export default function LivePage() {
  const router = useRouter();
  const [scenario, setScenario] = useState<Scenario>("job-interview");
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [fragments, setFragments] = useState<TranscriptFragment[]>([]);
  const [history, setHistory] = useState<SavedLiveSession[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const [storageNotice, setStorageNotice] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const connection = useRef<LiveConnection | null>(null);
  const current = useRef<SavedLiveSession | null>(null);
  const historyRef = useRef<SavedLiveSession[]>([]);
  const busy = useRef(false);
  const alive = useRef(false);
  const startedAt = useRef(0);
  const active = ["connecting", "live", "ending"].includes(status);

  const persist = useCallback((items: SavedLiveSession[]) => {
    historyRef.current = items;
    if (alive.current) setHistory(items);
    try { localStorage.setItem(LIVE_STORAGE_KEY, JSON.stringify(items)); }
    catch { if (alive.current) setStorageNotice("Browser storage is unavailable or full. This transcript may not survive closing the page."); }
  }, []);

  const saveCurrent = useCallback(() => {
    if (!current.current) return;
    if (startedAt.current) current.current.seconds = Math.floor((Date.now() - startedAt.current) / 1000);
    if (current.current.fragments.length) persist(saveLiveSession(historyRef.current, { ...current.current }));
  }, [persist]);

  useEffect(() => {
    alive.current = true;
    const load = setTimeout(() => {
      try { historyRef.current = readLiveHistory(localStorage); setHistory(historyRef.current); }
      catch { setStorageNotice("Saved Live history could not be read. Classic history is unaffected."); }
      setReady(true);
    }, 0);
    const leave = () => {
      saveCurrent();
      startedAt.current = 0;
      connection.current?.dispose();
      busy.current = false;
      if (alive.current) setStatus("ended");
    };
    window.addEventListener("pagehide", leave);
    return () => {
      alive.current = false;
      clearTimeout(load);
      window.removeEventListener("pagehide", leave);
      saveCurrent();
      connection.current?.dispose();
    };
  }, [saveCurrent]);

  useEffect(() => {
    if (status !== "live") return;
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [status]);

  function start() {
    if (busy.current || !ready || !audio.current) return;
    busy.current = true;
    connection.current?.dispose();
    current.current = { id: crypto.randomUUID(), scenario, createdAt: new Date().toISOString(), fragments: [], seconds: 0 };
    setCurrentId(current.current.id);
    startedAt.current = 0;
    setFragments([]); setSeconds(0); setMuted(false); setError(""); setBlocked(false);
    const instance = new LiveConnection(audio.current, {
      status(next) {
        if (!alive.current || connection.current !== instance) return;
        if (next === "live") startedAt.current = Date.now();
        if (next === "ended" || next === "error") {
          busy.current = false;
          saveCurrent();
          setSeconds(current.current?.seconds || 0);
          startedAt.current = 0;
        }
        setStatus(next);
      },
      fragment(fragment) {
        if (!alive.current || connection.current !== instance || !current.current) return;
        current.current.fragments = [...current.current.fragments, fragment];
        setFragments(current.current.fragments);
        saveCurrent();
      },
      error(message) { if (alive.current && connection.current === instance) setError(message); },
      playbackBlocked(value) { if (alive.current && connection.current === instance) setBlocked(value); },
    });
    connection.current = instance;
    void instance.start(scenario);
  }

  async function back() {
    await connection.current?.end();
    router.push("/");
  }

  return <main className="shell liveScreen">
    <button className="ghost backLink" onClick={() => void back()} disabled={status === "ending"}>← Back to choices</button>
    <header><p className="eyebrow">GPT-Live-1 · B1/B2 German</p><h1>Live Conversation</h1>
      <p className="muted">Speak naturally. Follow your words and your coach’s reply as live text.</p></header>
    <section className="card liveControls" aria-label="Conversation controls">
      <label>Scenario<select value={scenario} disabled={active} onChange={(event) => setScenario(event.target.value as Scenario)}>
        {Object.entries(scenarioLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <p className="muted">Voice sessions cost US$0.05/minute, billed per second. Starting a connection bills 15 seconds, credited toward the session. Muting keeps the paid session running.</p>
      <div className="liveButtons">
        <button className="record" disabled={active || !ready} onClick={start}>{status === "error" || status === "ended" ? "Start new session" : "Start conversation"}</button>
        <button className="ghost" disabled={status !== "live"} onClick={() => { connection.current?.mute(!muted); setMuted(!muted); }}>{muted ? "Unmute microphone" : "Mute microphone"}</button>
        <button className="ghost" disabled={!active || status === "ending"} onClick={() => void connection.current?.end()}>End conversation</button>
      </div>
      <p role="status">{statusLabels[status]}{status === "live" && muted ? " · Microphone muted" : ""} · {formatTime(seconds)}</p>
      {error && <p role="alert" className="errorBox">{error}</p>}
      {blocked && active && <div role="alert"><p>Your browser blocked the coach’s audio.</p><button onClick={() => void connection.current?.play()}>Play coach audio</button></div>}
    </section>
    <audio ref={audio} autoPlay playsInline />
    <Transcript fragments={fragments} />
    <p className="muted">Transcripts may contain recognition errors. Coach text represents generated speech and may include audio you interrupted.</p>
    {storageNotice && <p role="alert">{storageNotice}</p>}
    <section className="card history"><h2>Saved live conversations</h2>
      <p className="muted">The latest 20 transcripts are saved in this browser. Audio is not saved.</p>
      {!history.length && <p>No saved conversations yet.</p>}
      {history.map((session) => <details key={session.id}>
        <summary>{scenarioLabels[session.scenario as Scenario] || session.scenario} · {new Date(session.createdAt).toLocaleString()} · {formatTime(session.seconds)}</summary>
        <Transcript fragments={session.fragments} />
        <button className="ghost" disabled={active && session.id === currentId} onClick={() => {
          if (current.current?.id === session.id) current.current = null;
          persist(historyRef.current.filter((item) => item.id !== session.id));
        }}>Delete transcript</button>
      </details>)}
    </section>
  </main>;
}

const statusLabels: Record<LiveStatus, string> = { idle: "Ready", connecting: "Connecting…", live: "Connected", ending: "Ending…", ended: "Session ended", error: "Connection error" };
function formatTime(seconds: number) { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
function Transcript({ fragments }: { fragments: TranscriptFragment[] }) {
  return <div className="transcriptGrid">{(["user", "assistant"] as const).map((speaker) => <section className="card transcriptPanel" key={speaker} aria-label={speaker === "user" ? "Your transcript" : "Coach transcript"}>
    <h2>{speaker === "user" ? "You" : "Coach"}</h2>
    <p lang="de">{fragments.filter((fragment) => fragment.speaker === speaker).map((fragment) => fragment.text).join("") || "Words will appear here…"}</p>
  </section>)}</div>;
}
