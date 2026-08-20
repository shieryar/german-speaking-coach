import { describe, expect, it } from "vitest";
import { getRecordingButtonLabel, isRecordingButtonDisabled } from "@/lib/recordingControls";

describe("recording button behavior", () => {
  it("tells the learner to hold, then release to stop while recording", () => {
    expect(getRecordingButtonLabel("idle")).toBe("Hold to speak");
    expect(getRecordingButtonLabel("recording")).toBe("Release to stop");
  });

  it("disables recording only while the app is processing or speaking", () => {
    expect(isRecordingButtonDisabled("idle")).toBe(false);
    expect(isRecordingButtonDisabled("recording")).toBe(false);
    expect(isRecordingButtonDisabled("transcribing")).toBe(true);
    expect(isRecordingButtonDisabled("thinking")).toBe(true);
    expect(isRecordingButtonDisabled("speaking")).toBe(true);
  });
});
