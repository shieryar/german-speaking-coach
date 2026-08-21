const RECORDING_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
];

export function getPreferredRecordingMimeType(mediaRecorder: typeof MediaRecorder | undefined = globalThis.MediaRecorder) {
  if (!mediaRecorder?.isTypeSupported) return undefined;
  return RECORDING_MIME_CANDIDATES.find((mimeType) => mediaRecorder.isTypeSupported(mimeType));
}

export function getAudioExtension(mimeType: string | undefined) {
  const normalized = (mimeType || "").toLowerCase();
  if (normalized.includes("mp4")) return "mp4";
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("webm")) return "webm";
  return "webm";
}

export function buildRecordingFileName(mimeType: string | undefined) {
  return `speech.${getAudioExtension(mimeType)}`;
}
