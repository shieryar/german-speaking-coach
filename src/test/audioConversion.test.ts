import { describe, expect, it } from "vitest";
import { encodeAudioBufferAsWav, shouldConvertRecordingToWav } from "@/lib/audioConversion";

describe("iPhone audio conversion", () => {
  it("converts Safari MP4 recordings to WAV before upload", () => {
    expect(shouldConvertRecordingToWav("audio/mp4")).toBe(true);
    expect(shouldConvertRecordingToWav("audio/mp4;codecs=mp4a.40.2")).toBe(true);
    expect(shouldConvertRecordingToWav("audio/webm;codecs=opus")).toBe(false);
  });

  it("encodes mono PCM as a valid 16-bit WAV file", () => {
    const samples = new Float32Array([-1, -0.5, 0, 0.5, 1]);
    const audioBuffer = {
      numberOfChannels: 1,
      length: samples.length,
      sampleRate: 48000,
      getChannelData: () => samples,
    } as unknown as AudioBuffer;

    const wav = encodeAudioBufferAsWav(audioBuffer);
    const bytes = new Uint8Array(wav);
    const view = new DataView(wav);

    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe("WAVE");
    expect(new TextDecoder().decode(bytes.slice(12, 16))).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(new TextDecoder().decode(bytes.slice(36, 40))).toBe("data");
    expect(view.getUint32(40, true)).toBe(samples.length * 2);
    expect(bytes.byteLength).toBe(44 + samples.length * 2);
  });

  it("downmixes stereo recordings to one channel", () => {
    const left = new Float32Array([1, -1]);
    const right = new Float32Array([-1, 1]);
    const audioBuffer = {
      numberOfChannels: 2,
      length: 2,
      sampleRate: 44100,
      getChannelData: (channel: number) => (channel === 0 ? left : right),
    } as unknown as AudioBuffer;

    const wav = encodeAudioBufferAsWav(audioBuffer);
    const view = new DataView(wav);

    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(0);
  });
});
