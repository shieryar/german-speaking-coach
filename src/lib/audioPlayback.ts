export type TutorAudio = Pick<HTMLAudioElement, "play">;
export type PersistentTutorAudio = Pick<HTMLAudioElement, "src" | "load" | "play" | "pause" | "currentTime">;

// Four silent 8-bit PCM samples in a tiny, local WAV file.
export const SILENT_AUDIO_SOURCE =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAACAgICA";

export async function primeTutorAudio(audio: PersistentTutorAudio): Promise<"primed" | "blocked"> {
  audio.src = SILENT_AUDIO_SOURCE;
  audio.load();

  try {
    await audio.play();
    if (audio.src === SILENT_AUDIO_SOURCE) {
      audio.pause();
      audio.currentTime = 0;
    }
    return "primed";
  } catch (error) {
    if (isNotAllowedError(error)) return "blocked";
    throw error;
  }
}

export function setTutorAudioSource(audio: PersistentTutorAudio, url: string) {
  audio.pause();
  audio.src = url;
  audio.load();
}

export function revokeObsoleteAudioUrl(
  previousUrl: string | null,
  activeUrl: string | null,
  revoke: (url: string) => void = URL.revokeObjectURL,
) {
  if (!previousUrl || previousUrl === activeUrl) return false;
  revoke(previousUrl);
  return true;
}

export async function playTutorAudio(audio: TutorAudio): Promise<"playing" | "manual"> {
  try {
    await audio.play();
    return "playing";
  } catch (error) {
    if (isNotAllowedError(error)) return "manual";
    throw error;
  }
}

function isNotAllowedError(error: unknown) {
  return error instanceof DOMException && error.name === "NotAllowedError";
}
