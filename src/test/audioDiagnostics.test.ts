import { describe, expect, it } from "vitest";
import { formatBytes, formatDiagnosticReport, getAudioFileDiagnostics, getBlobSignature } from "@/lib/audioDiagnostics";

describe("audio diagnostics", () => {
  it("formats byte sizes for an iPhone troubleshooting report", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2_621_440)).toBe("2.5 MB");
  });

  it("reads the leading file bytes without including recorded audio", async () => {
    const blob = new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x10, 0xff])]);
    expect(await getBlobSignature(blob, 4)).toBe("52 49 46 46");
  });

  it("summarizes the file received by the server", async () => {
    const file = new File([new Uint8Array([0x52, 0x49, 0x46, 0x46])], "speech.wav", { type: "audio/wav" });
    expect(await getAudioFileDiagnostics(file)).toEqual({
      name: "speech.wav",
      type: "audio/wav",
      size: 4,
      signature: "52 49 46 46",
    });
  });

  it("formats copyable diagnostic lines", () => {
    expect(formatDiagnosticReport(["Browser: iPhone", "Upload: speech.wav (96 KB)"])).toBe(
      "German Speaking Coach audio diagnostics\nBrowser: iPhone\nUpload: speech.wav (96 KB)",
    );
  });
});
