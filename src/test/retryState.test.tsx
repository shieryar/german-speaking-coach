import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import LivePage from "@/app/live/page";
import RetryPanel from "@/app/components/RetryPanel";
import { appPost } from "@/lib/backend";
import type { TranscriptFragment } from "@/lib/live";
import type { LiveStatus } from "@/lib/liveConnection";

type Callbacks = { status: (status: LiveStatus) => void; fragment: (fragment: TranscriptFragment) => void };
type Fake = { callbacks: Callbacks; start: ReturnType<typeof vi.fn>; mute: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
const shared = vi.hoisted(() => ({ instances: [] as unknown[] }));
vi.mock("@/app/components/AuthGate", () => ({ default: ({ children }: { children: (session: { user: { id: string } }) => React.ReactNode }) => children({ user: { id: "user" } }) }));
vi.mock("@/lib/backend", () => ({ db: vi.fn().mockResolvedValue([]), appPost: vi.fn().mockResolvedValue({ valid: true, feedback: "Good alternative." }) }));
vi.mock("@/lib/liveConnection", () => ({
  LiveConnection: class {
    callbacks: Callbacks;
    start = vi.fn();
    mute = vi.fn();
    dispose = vi.fn();
    play = vi.fn().mockResolvedValue(undefined);
    end = vi.fn();
    constructor(_audio: HTMLAudioElement, callbacks: Callbacks) {
      this.callbacks = callbacks;
      this.start.mockImplementation(async () => callbacks.status("live"));
      this.end.mockImplementation(async () => callbacks.status("ended"));
      shared.instances.push(this);
    }
  },
}));
const latest = () => shared.instances.at(-1) as Fake;
const fragment = (speaker: "user" | "assistant", text: string, id: string): TranscriptFragment =>
  ({ eventId: id, speaker, text, startMs: 0, endMs: 100 });
beforeEach(() => { shared.instances = []; vi.mocked(appPost).mockClear(); window.history.replaceState({}, "", "/live"); vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("keeps the mission connection and state while practising, then resumes it", async () => {
  render(<LivePage />);
  await waitFor(() => expect((screen.getByText("Start conversation") as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText("Start conversation"));
  await waitFor(() => expect(shared.instances).toHaveLength(1));
  const mission = latest();
  act(() => {
    mission.callbacks.fragment(fragment("assistant", "Wie geht es Ihnen?", "a1"));
    mission.callbacks.fragment(fragment("user", "Mir geht es gut.", "u1"));
  });
  fireEvent.change(screen.getByLabelText("Difficult moment"), { target: { value: "1" } });
  fireEvent.click(screen.getByText("Practise that moment"));
  await waitFor(() => expect(screen.getByText("Start voice retry")).toBeTruthy());
  expect(mission.mute).toHaveBeenCalledWith(true);
  expect(mission.dispose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Start voice retry"));
  expect(shared.instances).toHaveLength(2);
  const retry = latest();
  expect(retry.start).toHaveBeenCalledWith(expect.objectContaining({ retry: expect.objectContaining({ original: "Mir geht es gut.", prompt: "Wie geht es Ihnen?" }) }));
  fireEvent.click(screen.getByText("Return to mission"));
  expect(retry.dispose).toHaveBeenCalled();
  expect(mission.dispose).not.toHaveBeenCalled();
  expect(mission.mute).toHaveBeenLastCalledWith(false);
  expect(screen.getByRole("log", { name: "Conversation messages" }).textContent).toContain("Mir geht es gut.");
});

it("hides a revealed suggestion during the voice retry and records assisted use", async () => {
  render(<RetryPanel missionId="apartment-viewing" difficulty="B1" sourceSessionId="d843997e-7160-47ae-ae20-5536c7b8589e"
    turnIndex={1} original="Gestern ich bin hier." prompt="Wann waren Sie hier?" correction="Gestern bin ich hier." onClose={() => {}} />);
  fireEvent.click(screen.getByText("Show suggested answer"));
  expect(screen.getByText("Gestern bin ich hier.")).toBeTruthy();
  fireEvent.click(screen.getByText("Start voice retry"));
  expect(screen.queryByText("Gestern bin ich hier.")).toBeNull();
  const retry = latest();
  act(() => retry.callbacks.fragment(fragment("user", "Gestern war ich hier.", "u1")));
  fireEvent.click(screen.getByText("Finish attempt"));
  await waitFor(() => expect(appPost).toHaveBeenCalledWith("/api/retry", expect.objectContaining({ assisted: true, attempt: "Gestern war ich hier." })));
});
