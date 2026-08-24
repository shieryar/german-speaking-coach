/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";

class FakeMediaRecorder {
  static isTypeSupported() {
    return true;
  }

  state: RecordingState = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob([new Uint8Array(1_200)], { type: this.mimeType }) } as BlobEvent);
    this.onstop?.();
  }
}

describe("persistent tutor audio element", () => {
  const playedElements: HTMLMediaElement[] = [];

  beforeEach(() => {
    playedElements.length = 0;
    localStorage.clear();
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
    });
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
      playedElements.push(this);
      return Promise.resolve();
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ transcript: "Ich arbeite." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        transcript: "Ich arbeite.",
        assessment: "correct",
        corrected: "Ich arbeite.",
        betterVersion: "Ich arbeite als Entwickler.",
        explanation: "Already correct.",
        tutorReply: "Woran arbeiten Sie gerade?",
        mistakes: [],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      })));
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:tutor") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("starts priming synchronously on recording press before microphone access resolves", () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(() => new Promise(() => undefined)),
      },
    });
    const { container } = render(<Home />);
    const persistentAudio = container.querySelector("audio");

    fireEvent.pointerDown(screen.getByRole("button", { name: /hold to record/i }));

    expect(playedElements).toEqual([persistentAudio]);
  });

  it("primes and plays every reply through the same visible media element", async () => {
    const { container } = render(<Home />);
    const persistentAudio = container.querySelector("audio");
    const recordButton = screen.getByRole("button", { name: /hold to record/i });

    expect(persistentAudio).not.toBeNull();
    expect(persistentAudio?.hasAttribute("hidden")).toBe(true);

    fireEvent.pointerDown(recordButton);
    await waitFor(() => expect(recordButton.textContent).toBe("Release to stop"));
    fireEvent.pointerUp(recordButton);

    await screen.findByText("Woran arbeiten Sie gerade?");
    expect(screen.getByText(/Correct as spoken/)).toBeTruthy();
    expect(screen.getByText("Optional alternative")).toBeTruthy();
    await waitFor(() => expect(playedElements).toHaveLength(2));

    expect(playedElements[0]).toBe(persistentAudio);
    expect(playedElements[1]).toBe(persistentAudio);
    expect(container.querySelectorAll("audio")).toHaveLength(1);
    expect(persistentAudio?.hasAttribute("hidden")).toBe(false);
    expect(persistentAudio?.getAttribute("src")).toBe("blob:tutor");
  });
});
