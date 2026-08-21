"use client";

import { useEffect, useRef, useState } from "react";
import type { PracticeMode, PracticeResponse, Scenario } from "@/lib/practice";
import { scenarioLabels } from "@/lib/practice";
import { formatBytes, formatDiagnosticReport, getBlobSignature } from "@/lib/audioDiagnostics";
import {
  convertRecordingToWav,
  shouldConvertRecordingToWav,
} from "@/lib/audioConversion";
import {
  buildRecordingFileName,
  getPreferredRecordingMimeType,
  getRecordingTimeslice,
} from "@/lib/audioUpload";
import { APP_VERSION, formatAppVersion } from "@/lib/appVersion";
import { getRecordingButtonLabel, isRecordingButtonDisabled } from "@/lib/recordingControls";

type Turn = PracticeResponse & { id: string; mode: PracticeMode; scenario: Scenario; createdAt: string };
type Status = "idle" | "recording" | "transcribing" | "thinking" | "speaking" | "error";

const scenarios = Object.entries(scenarioLabels) as [Scenario, string][];

export default function Home() {
  const [mode, setMode] = useState<PracticeMode>("conversation");
  const [scenario, setScenario] = useState<Scenario>("job-interview");
  const [status, setStatus] = useState<Status>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [hasLoadedTurns, setHasLoadedTurns] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const diagnosticsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    window.setTimeout(() => {
      if (cancelled) return;

      try {
        const saved = window.localStorage.getItem("german-speaking-coach-turns");
        setTurns(saved ? JSON.parse(saved) : []);
      } catch {
        window.localStorage.removeItem("german-speaking-coach-turns");
        setTurns([]);
      } finally {
        setHasLoadedTurns(true);
      }
    }, 0);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedTurns) return;
    localStorage.setItem("german-speaking-coach-turns", JSON.stringify(turns.slice(0, 50)));
  }, [hasLoadedTurns, turns]);

  function resetDiagnostics() {
    const initial = [
      `App version: ${APP_VERSION}`,
      `Browser: ${navigator.userAgent}`,
      `Started: ${new Date().toISOString()}`,
    ];
    diagnosticsRef.current = initial;
    setDiagnostics(initial);
  }

  function appendDiagnostic(line: string) {
    diagnosticsRef.current = [...diagnosticsRef.current, line];
    setDiagnostics(diagnosticsRef.current);
  }

  async function startRecording() {
    resetDiagnostics();
    setError(null);
    setAudioUrl(null);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMimeType = getPreferredRecordingMimeType();
      appendDiagnostic(`Preferred MIME: ${preferredMimeType || "browser default"}`);
      const recorder = new MediaRecorder(stream, preferredMimeType ? { mimeType: preferredMimeType } : undefined);
      recorderRef.current = recorder;
      appendDiagnostic(`Recorder MIME: ${recorder.mimeType || "not reported"}`);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const mimeType = recorder.mimeType || preferredMimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        appendDiagnostic(`Chunks: ${chunksRef.current.length} (${chunksRef.current.map((chunk) => formatBytes(chunk.size)).join(", ") || "none"})`);
        appendDiagnostic(`Recorded blob: ${blob.type || "no type"}, ${formatBytes(blob.size)}, signature ${await getBlobSignature(blob) || "empty"}`);
        await handleAudio(blob, mimeType);
      };
      const timeslice = getRecordingTimeslice(recorder.mimeType || preferredMimeType);
      appendDiagnostic(`Recording mode: ${timeslice === undefined ? "single finalized file" : `${timeslice} ms chunks`}`);
      if (timeslice === undefined) recorder.start();
      else recorder.start(timeslice);
      setStatus("recording");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not access microphone";
      appendDiagnostic(`Recording error: ${message}`);
      setStatus("error");
      setError(message);
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function cancelDefaultTouch(event: React.TouchEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  async function handleAudio(blob: Blob, mimeType: string) {
    try {
      if (blob.size < 1000) throw new Error("Recording was too short or empty. Hold the button while speaking, then release.");
      setStatus("transcribing");

      let uploadBlob = blob;
      let uploadMimeType = mimeType;
      if (shouldConvertRecordingToWav(mimeType)) {
        appendDiagnostic("Conversion: MP4 → mono 16-bit PCM WAV started");
        uploadBlob = await convertRecordingToWav(blob);
        uploadMimeType = "audio/wav";
        appendDiagnostic(`Converted WAV: ${formatBytes(uploadBlob.size)}, signature ${await getBlobSignature(uploadBlob)}`);
      } else {
        appendDiagnostic("Conversion: skipped for this MIME type");
      }

      const uploadFileName = buildRecordingFileName(uploadMimeType);
      appendDiagnostic(`Upload: ${uploadFileName}, ${uploadMimeType}, ${formatBytes(uploadBlob.size)}`);
      const form = new FormData();
      form.append("audio", uploadBlob, uploadFileName);
      const transcribe = await fetch("/api/transcribe", { method: "POST", body: form });
      const transcribeData = await transcribe.json();
      appendDiagnostic(`Transcription response: HTTP ${transcribe.status} ${JSON.stringify(transcribeData)}`);
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
      const message = e instanceof Error ? e.message : "Something went wrong";
      appendDiagnostic(`Processing error: ${message}`);
      setStatus("error");
      setError(message);
    }
  }

  async function copyDiagnostics() {
    await navigator.clipboard.writeText(formatDiagnosticReport(diagnosticsRef.current));
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
          <p className="versionBadge">{formatAppVersion()}</p>
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

      {diagnostics.length > 0 && (
        <details className="card diagnosticBox" open={status === "error"}>
          <summary>Audio troubleshooting report</summary>
          <p className="muted">This contains technical metadata only, not your recorded audio.</p>
          <pre>{formatDiagnosticReport(diagnostics)}</pre>
          <button type="button" className="ghost" onClick={copyDiagnostics}>Copy troubleshooting report</button>
        </details>
      )}

      <section className="grid">
        <article className="card conversation">
          <h2>Current turn</h2>
          {!latest && <p className="muted">Start by holding “Hold to speak”. Release when you finish. The tutor will show and speak its reply.</p>}
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
