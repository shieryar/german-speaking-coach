"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { scenarioLabels, type Scenario } from "@/lib/scenarios";
import { LIVE_STORAGE_KEY, readLiveHistory, saveLiveSession, type SavedLiveSession, type TranscriptFragment } from "@/lib/live";
import { LiveConnection, type LiveStatus } from "@/lib/liveConnection";
import SiteNav from "@/app/components/SiteNav";
import Transcript from "@/app/components/Transcript";

export default function LivePage() {
  const [scenario, setScenario] = useState<Scenario>("job-interview");
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [fragments, setFragments] = useState<TranscriptFragment[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const [storageNotice, setStorageNotice] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [ready, setReady] = useState(false);
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
      try { historyRef.current = readLiveHistory(localStorage); }
      catch { setStorageNotice("Saved conversation history could not be read."); }
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

  return <main className="siteShell liveScreen">
    <SiteNav current="live" />

    <header className="pageHeader">
      <h1>Live Conversation</h1>
      <p>Choose a scenario, then start speaking.</p>
    </header>

    <div className="workspaceStack">
      <section className="panel liveControls" aria-label="Conversation controls">
        <div className="panelHeading"><h2>Session controls</h2></div>
        <div className="controlsGrid">
        <div>
        <label className="scenarioLabel" htmlFor="scenario">Your scenario</label>
        <div className="selectWrap"><select id="scenario" value={scenario} disabled={active} onChange={(event) => setScenario(event.target.value as Scenario)}>
          {Object.entries(scenarioLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select><span aria-hidden="true">⌄</span></div>
        <div className="sessionCost"><span className="costIcon" aria-hidden="true">i</span><p>Voice sessions cost US$0.05/minute, billed per second. Starting a connection bills 15 seconds, credited toward the session. Muting keeps the paid session running.</p></div>
        </div>
        <div>
        <div className="liveButtons">
          <button className="record" disabled={active || !ready} onClick={start}><span className="buttonMic" aria-hidden="true">✦</span>{status === "error" || status === "ended" ? "Start new session" : "Start conversation"}<span aria-hidden="true">↗</span></button>
          <div className="secondaryButtons"><button className="ghost" disabled={status !== "live"} onClick={() => { connection.current?.mute(!muted); setMuted(!muted); }}>{muted ? "Unmute microphone" : "Mute microphone"}</button>
          <button className="ghost" disabled={!active || status === "ending"} onClick={() => void connection.current?.end()}>End conversation</button></div>
        </div>
        <div className="sessionStatus" role="status"><span className={`statusDot ${status === "live" ? "statusDotLive" : ""}`} /><span>{statusLabels[status]}{status === "live" && muted ? " · Microphone muted" : ""}</span><span className="sessionTimer">{formatTime(seconds)}</span></div>
        {error && <p role="alert" className="errorBox">{error}</p>}
        {blocked && active && <div className="playbackAlert" role="alert"><p>Your browser blocked the coach&apos;s audio.</p><button onClick={() => void connection.current?.play()}>Play coach audio</button></div>}
        </div>
        </div>
      </section>

      <div className="transcriptColumn"><Transcript fragments={fragments} autoScroll /><p className="transcriptNote">Transcripts may contain recognition errors. Coach text represents generated speech and may include audio you interrupted.</p></div>
    </div>
    <audio ref={audio} autoPlay playsInline />
    {storageNotice && <p role="alert" className="storageNotice">{storageNotice}</p>}
    <footer className="siteFooter">German Coach · B1 / B2</footer>
  </main>;}

const statusLabels: Record<LiveStatus, string> = { idle: "Ready", connecting: "Connecting…", live: "Connected", ending: "Ending…", ended: "Session ended", error: "Connection error" };
function formatTime(seconds: number) { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
