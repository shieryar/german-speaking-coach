import { describe, expect, it, vi } from "vitest";
import {
  buildRecordingFileName,
  getAudioExtension,
  getPreferredRecordingMimeType,
  getRecordingTimeslice,
} from "@/lib/audioUpload";

describe("audio upload helpers", () => {
  it("uses a filename extension that matches the recorded MIME type", () => {
    expect(buildRecordingFileName("audio/mp4")).toBe("speech.mp4");
    expect(buildRecordingFileName("audio/webm;codecs=opus")).toBe("speech.webm");
    expect(buildRecordingFileName("audio/mpeg")).toBe("speech.mp3");
    expect(buildRecordingFileName("audio/wav")).toBe("speech.wav");
  });

  it("falls back to webm when the MIME type is unknown", () => {
    expect(getAudioExtension(undefined)).toBe("webm");
    expect(buildRecordingFileName("")).toBe("speech.webm");
  });

  it("chooses the first supported recording MIME type", () => {
    const mediaRecorder = {
      isTypeSupported: vi.fn((mimeType: string) => mimeType === "audio/mp4"),
    } as unknown as typeof MediaRecorder;

    expect(getPreferredRecordingMimeType(mediaRecorder)).toBe("audio/mp4");
  });

  it("records MP4 as one complete file instead of concatenated timeslice fragments", () => {
    expect(getRecordingTimeslice("audio/mp4")).toBeUndefined();
    expect(getRecordingTimeslice("audio/mp4;codecs=mp4a.40.2")).toBeUndefined();
    expect(getRecordingTimeslice("audio/webm;codecs=opus")).toBe(1000);
  });
});
