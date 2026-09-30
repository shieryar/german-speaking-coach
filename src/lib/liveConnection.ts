import { parseTranscript, type TranscriptFragment } from "./live";
import type { Difficulty } from "./scenarios";
import { getAuth } from "./backend";

export type ConnectionOptions = { missionId: string; difficulty: Difficulty; sessionId: string; retainTranscript: boolean;
  retry?: { sourceSessionId: string; turnIndex: number; prompt: string; original: string } };

export type LiveStatus = "idle" | "connecting" | "live" | "ending" | "ended" | "error";
type Callbacks = {
  status: (status: LiveStatus) => void;
  fragment: (fragment: TranscriptFragment) => void;
  error: (message: string) => void;
  playbackBlocked: (blocked: boolean) => void;
};

// One instance owns one attempt. Disposed attempts cannot update a newer session.
export class LiveConnection {
  private peer?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private stream?: MediaStream;
  private disposed = false;
  private started = false;
  private closing?: Promise<void>;
  private resolveClose?: () => void;
  private startupTimer?: ReturnType<typeof setTimeout>;
  private abort = new AbortController();
  private seen = new Set<string>();

  constructor(private audio: HTMLAudioElement, private callbacks: Callbacks) {}

  async start(options: ConnectionOptions) {
    if (this.started || this.disposed) return;
    this.started = true;
    this.callbacks.status("connecting");
    this.startupTimer = setTimeout(() => this.fail("Connection timed out. Please try again."), 40_000);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
        throw new Error("Live needs microphone access in a supported browser on HTTPS or localhost.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (this.disposed) { stream.getTracks().forEach((track) => track.stop()); return; }
      this.stream = stream;
      const peer = this.peer = new RTCPeerConnection();
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      peer.ontrack = (event) => {
        if (this.disposed) return;
        this.audio.srcObject = event.streams[0] || new MediaStream([event.track]);
        void this.play();
      };
      peer.onconnectionstatechange = () => {
        if (!this.disposed && ["failed", "disconnected", "closed"].includes(peer.connectionState)) {
          this.fail("The connection ended unexpectedly. Your received transcript is kept. Start a new session to retry.");
        }
      };
      const channel = this.channel = peer.createDataChannel("oai-events");
      channel.onmessage = ({ data }) => this.receive(data);
      channel.onclose = () => {
        if (!this.disposed) this.fail("The session disconnected before closure was confirmed. Your received transcript is kept.");
      };
      channel.onerror = () => this.fail("Live connection failed. Please start a new session.");
      await peer.setLocalDescription(await peer.createOffer());
      await this.waitForIce(peer);
      if (this.disposed) return;
      const token = (await getAuth())?.access_token;
      if (!token) throw new Error("Your learning session is unavailable. Reload the page and try again.");
      const response = await fetch("/api/live/session", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sdp: peer.localDescription?.sdp, ...options }), signal: this.abort.signal,
      });
      const answer = await response.json();
      if (this.disposed) return;
      if (!response.ok) throw new Error(answer.error || "Live session could not start.");
      if (typeof answer.transport?.sdp !== "string") throw new Error("The server returned an invalid connection answer.");
      await peer.setRemoteDescription({ type: "answer", sdp: answer.transport.sdp });
    } catch (error) {
      if (this.disposed) return;
      const denied = error instanceof DOMException && error.name === "NotAllowedError";
      this.fail(denied ? "Microphone permission denied. Allow microphone access in browser settings, then try again."
        : error instanceof Error ? error.message : "Could not start Live Conversation. Please try again.");
    }
  }

  private waitForIce(peer: RTCPeerConnection) {
    if (peer.iceGatheringState === "complete") return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        peer.removeEventListener("icegatheringstatechange", changed);
        this.abort.signal.removeEventListener("abort", aborted);
        if (error) reject(error); else resolve();
      };
      const changed = () => { if (peer.iceGatheringState === "complete") finish(); };
      const aborted = () => finish(new Error("Connection cancelled."));
      const timer = setTimeout(() => finish(new Error("Network setup timed out. Please try again.")), 8_000);
      peer.addEventListener("icegatheringstatechange", changed);
      this.abort.signal.addEventListener("abort", aborted, { once: true });
      if (this.abort.signal.aborted) aborted(); else changed();
    });
  }

  private receive(data: string) {
    if (this.disposed) return;
    let event: Record<string, unknown>;
    try { event = JSON.parse(data); } catch { return; }
    if (!event || typeof event !== "object") return;
    if (event.type === "session.started") {
      clearTimeout(this.startupTimer);
      if (!this.closing) this.callbacks.status("live");
    } else if (event.type === "session.closed") {
      this.callbacks.status("ended");
      this.cleanup();
    } else if (event.type === "error") {
      this.fail("The Live service reported an error. Ended this connection; start a new session to retry.");
    } else {
      const fragment = parseTranscript(event);
      if (fragment && !this.seen.has(fragment.eventId)) {
        this.seen.add(fragment.eventId);
        this.callbacks.fragment(fragment);
      }
    }
  }

  async play() {
    try {
      await this.audio.play();
      if (!this.disposed) this.callbacks.playbackBlocked(false);
    } catch { if (!this.disposed) this.callbacks.playbackBlocked(true); }
  }

  mute(muted: boolean) {
    this.stream?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
  }

  end(): Promise<void> {
    if (this.closing) return this.closing;
    if (this.disposed) return Promise.resolve();
    this.callbacks.status("ending");
    clearTimeout(this.startupTimer);
    this.mute(true);
    this.audio.pause();
    if (this.channel?.readyState !== "open") {
      this.cleanup();
      this.callbacks.status("ended");
      return Promise.resolve();
    }
    this.closing = new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.callbacks.error("Session closure could not be confirmed. The local connection has been released.");
        this.callbacks.status("ended");
        this.cleanup();
      }, 5_000);
      this.resolveClose = () => { clearTimeout(timer); resolve(); };
      try { this.channel!.send(JSON.stringify({ type: "session.close" })); }
      catch { this.fail("Session closure could not be confirmed. The local connection has been released."); }
    });
    return this.closing;
  }

  // Page exit cannot await server acknowledgment.
  dispose() {
    if (this.disposed) return;
    try { if (this.channel?.readyState === "open") this.channel.send(JSON.stringify({ type: "session.close" })); } catch {}
    this.cleanup();
  }

  private fail(message: string) {
    if (this.disposed) return;
    this.callbacks.error(message);
    this.callbacks.status("error");
    this.dispose();
  }

  private cleanup() {
    this.disposed = true;
    clearTimeout(this.startupTimer);
    this.abort.abort();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.channel?.close();
    this.peer?.close();
    this.audio.pause();
    this.audio.srcObject = null;
    this.resolveClose?.();
  }
}
