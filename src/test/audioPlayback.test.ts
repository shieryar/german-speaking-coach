import { describe, expect, it, vi } from "vitest";
import {
  SILENT_AUDIO_SOURCE,
  playTutorAudio,
  primeTutorAudio,
  revokeObsoleteAudioUrl,
  setTutorAudioSource,
} from "@/lib/audioPlayback";

function createAudio() {
  return {
    src: "",
    currentTime: 0,
    load: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
  };
}

describe("tutor audio playback", () => {
  it("primes the persistent media element with local silent audio", async () => {
    const audio = createAudio();

    const result = await primeTutorAudio(audio);

    expect(result).toBe("primed");
    expect(audio.src).toBe(SILENT_AUDIO_SOURCE);
    expect(audio.load).toHaveBeenCalledOnce();
    expect(audio.play).toHaveBeenCalledOnce();
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(audio.currentTime).toBe(0);
  });

  it("loads each tutor response into the same media element", () => {
    const audio = createAudio();

    setTutorAudioSource(audio, "blob:first");
    setTutorAudioSource(audio, "blob:second");

    expect(audio.src).toBe("blob:second");
    expect(audio.load).toHaveBeenCalledTimes(2);
  });

  it("revokes an obsolete object URL but not the active URL", () => {
    const revoke = vi.fn();

    expect(revokeObsoleteAudioUrl("blob:first", "blob:second", revoke)).toBe(true);
    expect(revoke).toHaveBeenCalledWith("blob:first");

    revoke.mockClear();
    expect(revokeObsoleteAudioUrl("blob:second", "blob:second", revoke)).toBe(false);
    expect(revoke).not.toHaveBeenCalled();
  });

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
