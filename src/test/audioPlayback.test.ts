import { describe, expect, it } from "vitest";
import { playTutorAudio } from "@/lib/audioPlayback";

describe("tutor audio playback", () => {
  it("falls back to manual playback when Safari blocks autoplay", async () => {
    const audio = {
      play: async () => {
        throw new DOMException(
          "The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.",
          "NotAllowedError",
        );
      },
    };

    await expect(playTutorAudio(audio)).resolves.toBe("manual");
  });
});
