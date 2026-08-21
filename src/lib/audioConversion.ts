export function shouldConvertRecordingToWav(mimeType: string | undefined) {
  return (mimeType || "").toLowerCase().includes("mp4");
}

export function encodeAudioBufferAsWav(audioBuffer: AudioBuffer): ArrayBuffer {
  const channelCount = Math.max(1, audioBuffer.numberOfChannels);
  const sampleCount = audioBuffer.length;
  const bytesPerSample = 2;
  const headerSize = 44;
  const wav = new ArrayBuffer(headerSize + sampleCount * bytesPerSample);
  const view = new DataView(wav);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, wav.byteLength - 8, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, audioBuffer.sampleRate, true);
  view.setUint32(28, audioBuffer.sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, sampleCount * bytesPerSample, true);

  const channels = Array.from({ length: channelCount }, (_, channel) => audioBuffer.getChannelData(channel));
  let offset = headerSize;
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    let sample = 0;
    for (const channel of channels) sample += channel[sampleIndex] || 0;
    sample = Math.max(-1, Math.min(1, sample / channelCount));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += bytesPerSample;
  }

  return wav;
}

export async function convertRecordingToWav(blob: Blob): Promise<Blob> {
  const webkitAudioContext = (globalThis as typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  }).webkitAudioContext;
  const AudioContextConstructor = globalThis.AudioContext || webkitAudioContext;
  if (!AudioContextConstructor) throw new Error("Audio conversion is not supported by this browser.");

  const context = new AudioContextConstructor();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    return new Blob([encodeAudioBufferAsWav(decoded)], { type: "audio/wav" });
  } finally {
    await context.close();
  }
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
