export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024)} KB`;
  return `${formatNumber(bytes / (1024 * 1024))} MB`;
}

export async function getBlobSignature(blob: Blob, length = 16) {
  const bytes = new Uint8Array(await blob.slice(0, length).arrayBuffer());
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

export async function getAudioFileDiagnostics(file: File) {
  return {
    name: file.name,
    type: file.type || "not reported",
    size: file.size,
    signature: await getBlobSignature(file),
  };
}

export function formatDiagnosticReport(lines: string[]) {
  return ["German Speaking Coach audio diagnostics", ...lines].join("\n");
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
