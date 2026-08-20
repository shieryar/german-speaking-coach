export type RecordingStatus = "idle" | "recording" | "transcribing" | "thinking" | "speaking" | "error";

export function getRecordingButtonLabel(status: RecordingStatus) {
  return status === "recording" ? "Release to stop" : "Hold to speak";
}

export function isRecordingButtonDisabled(status: RecordingStatus) {
  return ["transcribing", "thinking", "speaking"].includes(status);
}
