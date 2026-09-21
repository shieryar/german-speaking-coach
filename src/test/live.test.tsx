import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import LivePage from "@/app/live/page";
import { LIVE_STORAGE_KEY, readLiveHistory, saveLiveSession, type SavedLiveSession } from "@/lib/live";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

class FakeChannel {
  readyState = "open";
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;
  onerror?: () => void;
  send = vi.fn();
  close = vi.fn(() => { this.readyState = "closed"; this.onclose?.(); });
  emit(event: object) { this.onmessage?.({ data: JSON.stringify(event) }); }
}
class FakePeer {
  static instances: FakePeer[] = [];
  channel = new FakeChannel();
  connectionState = "connected";
  iceGatheringState = "complete";
  localDescription = { sdp: "offer" };
  onconnectionstatechange?: () => void;
  ontrack?: (event: { streams: object[] }) => void;
  constructor() { FakePeer.instances.push(this); }
  addTrack = vi.fn();
  createDataChannel = () => this.channel;
  createOffer = async () => ({ type: "offer", sdp: "offer" });
  setLocalDescription = vi.fn().mockResolvedValue(undefined);
  setRemoteDescription = vi.fn().mockResolvedValue(undefined);
  close = vi.fn();
}
const track = { stop: vi.fn(), enabled: true };
const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
const getUserMedia = vi.fn();
const lastPeer = () => FakePeer.instances.at(-1)!;
const emit = (event: object) => act(() => lastPeer().channel.emit(event));
const fragment = (speaker: "input" | "output", text: string, id: string) => ({
  type: `session.${speaker}_transcript.delta`, delta: text, event_id: id, start_ms: 100, end_ms: 200,
});

beforeEach(() => {
  localStorage.clear(); FakePeer.instances = []; push.mockClear(); track.stop.mockClear(); track.enabled = true;
  getUserMedia.mockReset().mockResolvedValue(stream);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  vi.stubGlobal("RTCPeerConnection", FakePeer);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ session: { id: "live_test" }, transport: { sdp: "answer" } }), { status: 201 })));
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function startPage() {
  render(<LivePage />);
  await waitFor(() => expect((screen.getByText("Start conversation") as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText("Start conversation"));
  await waitFor(() => expect(lastPeer()?.setRemoteDescription).toHaveBeenCalled());
  emit({ type: "session.started" });
}

describe("practice screens", () => {
  it("links to both screens without asking for a microphone", () => {
    render(<Home />);
    expect(screen.getByRole("link", { name: /Classic Practice/ }).getAttribute("href")).toBe("/classic");
    expect(screen.getByRole("link", { name: /Live Conversation/ }).getAttribute("href")).toBe("/live");
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("keeps overlapping transcripts verbatim, saves timestamps, mutes and ends gracefully", async () => {
    localStorage.setItem("german-speaking-coach-turns", '[{"id":"classic"}]');
    await startPage();
    emit(fragment("input", "Ich", "u1"));
    emit(fragment("output", "Guten Tag.", "a1"));
    emit(fragment("input", " arbeite hier.", "u2"));
    emit(fragment("input", " arbeite hier.", "u2"));
    expect(screen.getAllByRole("region", { name: "Your transcript" })[0].textContent).toContain("Ich arbeite hier.");
    expect(screen.getAllByRole("region", { name: "Coach transcript" })[0].textContent).toContain("Guten Tag.");
    const saved = readLiveHistory(localStorage)[0];
    expect(saved.fragments).toHaveLength(3);
    expect(saved.fragments[0].startMs).toBe(100);
    expect(localStorage.getItem("german-speaking-coach-turns")).toBe('[{"id":"classic"}]');
    fireEvent.click(screen.getByText("Mute microphone")); expect(track.enabled).toBe(false);
    fireEvent.click(screen.getByText("Unmute microphone")); expect(track.enabled).toBe(true);
    fireEvent.click(screen.getByText("End conversation"));
    expect(lastPeer().channel.send).toHaveBeenCalledWith(JSON.stringify({ type: "session.close" }));
    expect(lastPeer().close).not.toHaveBeenCalled();
    emit({ type: "session.closed" });
    expect(lastPeer().close).toHaveBeenCalled(); expect(track.stop).toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("Session ended");
  });

  it("does not create two sessions from repeated Start clicks", async () => {
    await startPage();
    fireEvent.click(screen.getByText("Start conversation"));
    expect(getUserMedia).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("waits for closure before navigating through the back control", async () => {
    await startPage();
    fireEvent.click(screen.getByText(/Back to choices/));
    expect(push).not.toHaveBeenCalled();
    emit({ type: "session.closed" });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });

  it("retains transcripts after network loss and ignores late events when retrying", async () => {
    await startPage();
    emit(fragment("input", "Erste Sitzung", "one"));
    const old = lastPeer();
    act(() => { old.connectionState = "disconnected"; old.onconnectionstatechange?.(); });
    expect(screen.getByRole("alert").textContent).toContain("unexpectedly");
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Start new session"));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    act(() => old.channel.emit(fragment("input", "LATE", "late")));
    expect(screen.queryByText(/LATE/)).toBeNull();
    expect(readLiveHistory(localStorage)[0].fragments[0].text).toBe("Erste Sitzung");
  });

  it("handles microphone denial without creating a paid session", async () => {
    getUserMedia.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    render(<LivePage />);
    await waitFor(() => expect((screen.getByText("Start conversation") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText("Start conversation"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Microphone permission denied"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("releases the microphone after a session creation error", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: "Check GPT-Live-1 access." }), { status: 502 }));
    render(<LivePage />);
    await waitFor(() => expect((screen.getByText("Start conversation") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText("Start conversation"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Check GPT-Live-1 access"));
    expect(track.stop).toHaveBeenCalled();
  });

  it("offers playback recovery after autoplay is blocked", async () => {
    await startPage();
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error("autoplay"));
    act(() => lastPeer().ontrack?.({ streams: [stream] }));
    await waitFor(() => expect(screen.getByText("Play coach audio")).toBeTruthy());
    fireEvent.click(screen.getByText("Play coach audio"));
    await waitFor(() => expect(screen.queryByText("Play coach audio")).toBeNull());
  });

  it("reloads saved transcripts and deletes them without touching Classic history", async () => {
    const saved: SavedLiveSession = { id: "saved", scenario: "meeting", createdAt: new Date().toISOString(), seconds: 10,
      fragments: [{ eventId: "1", speaker: "user", text: "Gespeichert", startMs: 0, endMs: 100 }] };
    localStorage.setItem(LIVE_STORAGE_KEY, JSON.stringify([saved]));
    localStorage.setItem("german-speaking-coach-turns", "[]");
    render(<LivePage />);
    await waitFor(() => expect(screen.getByText("Gespeichert")).toBeTruthy());
    fireEvent.click(screen.getByText("Delete transcript"));
    expect(readLiveHistory(localStorage)).toEqual([]);
    expect(localStorage.getItem("german-speaking-coach-turns")).toBe("[]");
  });

  it("releases the connection on unmount", async () => {
    await startPage();
    cleanup();
    expect(track.stop).toHaveBeenCalled(); expect(lastPeer().close).toHaveBeenCalled();
  });

  it("releases local resources if the server never acknowledges End", async () => {
    await startPage();
    vi.useFakeTimers();
    fireEvent.click(screen.getByText("End conversation"));
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByRole("alert").textContent).toContain("closure could not be confirmed");
    expect(lastPeer().close).toHaveBeenCalled(); expect(track.stop).toHaveBeenCalled();
  });

  it("cancels a pending microphone request without starting a session", async () => {
    let grant!: (value: typeof stream) => void;
    getUserMedia.mockReturnValue(new Promise((resolve) => { grant = resolve; }));
    render(<LivePage />);
    await waitFor(() => expect((screen.getByText("Start conversation") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText("Start conversation"));
    fireEvent.click(screen.getByText("End conversation"));
    await act(async () => { grant(stream); });
    expect(fetch).not.toHaveBeenCalled(); expect(track.stop).toHaveBeenCalled();
  });

  it("preserves transcript text on page exit without reconnecting", async () => {
    await startPage();
    emit(fragment("input", "Bis bald", "bye"));
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(readLiveHistory(localStorage)[0].fragments[0].text).toBe("Bis bald");
    expect(lastPeer().close).toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(1);
  });
});

it("retains only the latest 20 live sessions and updates existing records", () => {
  const make = (id: number): SavedLiveSession => ({ id: String(id), scenario: "meeting", createdAt: "2026-01-01", fragments: [], seconds: id });
  let history: SavedLiveSession[] = [];
  for (let id = 0; id < 25; id++) history = saveLiveSession(history, make(id));
  expect(history).toHaveLength(20); expect(history[0].id).toBe("24"); expect(history.at(-1)?.id).toBe("5");
  history = saveLiveSession(history, { ...make(24), seconds: 100 });
  expect(history).toHaveLength(20); expect(history[0].seconds).toBe(100);
});
