"use client";

import { useEffect, useRef, useState } from "react";
import type { PracticeMode, PracticeResponse, Scenario } from "@/lib/practice";
import { scenarioLabels } from "@/lib/practice";
import { getRecordingButtonLabel, isRecordingButtonDisabled } from "@/lib/recordingControls";

type Turn = PracticeResponse & { id: string; mode: PracticeMode; scenario: Scenario; createdAt: string };
type Status = "idle" | "recording" | "transcribing" | "thinking" | "speaking" | "error";

const scenarios = Object.entries(scenarioLabels) as [Scenario, string][];

export default function Home() {
  const [mode, setMode] = useState<PracticeMode>("conversation");
  const [scenario, setScenario] = useState<Scenario>("job-interview");
  const [status, setStatus] = useState<Status>("idle");
  const [turns, setTurns] = useState<Turn[]>(() => {
    if (typeof window === "undefined") return [];
    const saved = window.localStorage.getItem("german-speaking-coach-turns");
    return saved ? JSON.parse(saved) : [];
  });
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    localStorage.setItem("german-speaking-coach-turns", JSON.stringify(turns.slice(0, 50)));
  }, [turns]);

  async function startRecording() {
    setError(null);
    setAudioUrl(null);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        await handleAudio(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      };
      recorder.start();
      setStatus("recording");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Could not access microphone");
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function cancelDefaultTouch(event: React.TouchEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  async function handleAudio(blob: Blob) {
    try {
      setStatus("transcribing");
      const form = new FormData();
      form.append("audio", blob, "speech.webm");
      const transcribe = await fetch("/api/transcribe", { method: "POST", body: form });
      const transcribeData = await transcribe.json();
      if (!transcribe.ok) throw new Error(transcribeData.error || "Transcription failed");

      setStatus("thinking");
      const practice = await fetch("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          scenario,
          transcript: transcribeData.transcript,
          history: turns.slice(0, 6).flatMap((t) => [`You: ${t.transcript}`, `Tutor: ${t.tutorReply}`]),
        }),
      });
      const result = await practice.json();
      if (!practice.ok) throw new Error(result.error || "Practice response failed");

      const turn: Turn = { ...result, id: crypto.randomUUID(), mode, scenario, createdAt: new Date().toISOString() };
      setTurns((current) => [turn, ...current]);

      setStatus("speaking");
      const speech = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: turn.tutorReply }),
      });
      if (!speech.ok) {
        const speechError = await speech.json().catch(() => ({ error: "Speech failed" }));
        throw new Error(speechError.error || "Speech failed");
      }
      const speechBlob = await speech.blob();
      const url = URL.createObjectURL(speechBlob);
      setAudioUrl(url);
      const audio = new Audio(url);
      await audio.play();
      audio.onended = () => setStatus("idle");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  function clearProgress() {
    setTurns([]);
    localStorage.removeItem("german-speaking-coach-turns");
  }

  const latest = turns[0];
  const mistakeCounts = turns.flatMap((t) => t.mistakes).reduce<Record<string, number>>((acc, mistake) => {
    acc[mistake.topic] = (acc[mistake.topic] || 0) + 1;
    return acc;
  }, {});

  return (
    <main className="shell">
      <section className="hero card">
        <div>
          <p className="eyebrow">B1/B2 German · workplace · interviews · meetings</p>
          <h1>German Speaking Coach</h1>
          <p>No login. Speak on your iPhone, see your transcript, corrected German, a better professional version, and hear the tutor reply.</p>
        </div>
        <div className={`status ${status}`}>{statusLabel(status)}</div>
      </section>

      <section className="controls card">
        <label>
          Mode
          <select value={mode} onChange={(e) => setMode(e.target.value as PracticeMode)}>
            <option value="conversation">Conversation first</option>
            <option value="strict">Strict tutor</option>
          </select>
        </label>
        <label>
          Scenario
          <select value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)}>
            {scenarios.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button
          className="record"
          onPointerDown={startRecording}
          onPointerUp={stopRecording}
          onPointerLeave={stopRecording}
          onPointerCancel={stopRecording}
          onTouchStart={cancelDefaultTouch}
          disabled={isRecordingButtonDisabled(status)}
          aria-label="Hold to record German speech. Release to stop recording."
        >
          {getRecordingButtonLabel(status)}
        </button>
      </section>

      {error && <section className="card errorBox"><strong>Problem:</strong> {error}</section>}

      <section className="grid">
        <article className="card conversation">
          <h2>Current turn</h2>
          {!latest && <p className="muted">Start by tapping “Tap to speak”. The tutor will show and speak its reply.</p>}
          {latest && (
            <div className="turn">
              <Block title="You said" text={latest.transcript} />
              <Block title="Corrected German" text={latest.corrected} highlight />
              <Block title="Better professional version" text={latest.betterVersion} />
              <Block title="Why" text={latest.explanation} />
              <Block title="Tutor says" text={latest.tutorReply} tutor />
              {audioUrl && <audio controls src={audioUrl} className="audio" />}
            </div>
          )}
        </article>

        <aside className="card progress">
          <div className="progressHeader">
            <h2>Saved progress</h2>
            <button onClick={clearProgress} className="ghost">Clear</button>
          </div>
          <p>{turns.length} practice turns saved on this device.</p>
          <h3>Repeated topics</h3>
          {Object.keys(mistakeCounts).length === 0 ? <p className="muted">Mistakes will appear here after practice.</p> : (
            <ul>{Object.entries(mistakeCounts).sort((a,b)=>b[1]-a[1]).map(([topic,count]) => <li key={topic}>{topic}: {count}</li>)}</ul>
          )}
        </aside>
      </section>

      <section className="card history">
        <h2>Recent practice</h2>
        {turns.slice(1, 8).map((turn) => (
          <details key={turn.id}>
            <summary>{new Date(turn.createdAt).toLocaleString()} · {scenarioLabels[turn.scenario]} · {turn.mode}</summary>
            <p><strong>You:</strong> {turn.transcript}</p>
            <p><strong>Corrected:</strong> {turn.corrected}</p>
            <p><strong>Tutor:</strong> {turn.tutorReply}</p>
          </details>
        ))}
      </section>
    </main>
  );
}

function Block({ title, text, highlight, tutor }: { title: string; text: string; highlight?: boolean; tutor?: boolean }) {
  return <div className={`block ${highlight ? "highlight" : ""} ${tutor ? "tutor" : ""}`}><span>{title}</span><p>{text}</p></div>;
}

function statusLabel(status: Status) {
  return {
    idle: "Ready",
    recording: "Listening…",
    transcribing: "Writing what you said…",
    thinking: "Correcting…",
    speaking: "Tutor speaking…",
    error: "Needs attention",
  }[status];
}
