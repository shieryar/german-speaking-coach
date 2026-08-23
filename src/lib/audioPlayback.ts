export type TutorAudio = Pick<HTMLAudioElement, "play">;

export async function playTutorAudio(audio: TutorAudio): Promise<"playing" | "manual"> {
  try {
    await audio.play();
    return "playing";
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      return "manual";
    }
    throw error;
  }
}
