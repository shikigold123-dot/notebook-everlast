/**
 * Geteilt zwischen Server (Blob-Upload-Token-Route) und Client (SourceForm),
 * damit die Client-Vorprüfung exakt dieselben Werte nutzt wie die serverseitige
 * Durchsetzung — keine zwei Wahrheiten für dieselbe Grenze.
 */
export const UPLOAD_MAX_SIZES: Record<"pdf" | "audio", number> = {
  pdf: 15 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
};

export const UPLOAD_CONTENT_TYPES: Record<"pdf" | "audio", string[]> = {
  pdf: ["application/pdf"],
  audio: ["audio/mpeg", "audio/mp4", "audio/wav", "audio/x-m4a", "audio/webm"],
};

export function tokenOptionsForType(clientPayload: string | null) {
  const payload = clientPayload ? JSON.parse(clientPayload) : {};
  const type: "pdf" | "audio" = payload.type === "audio" ? "audio" : "pdf";
  return {
    allowedContentTypes: UPLOAD_CONTENT_TYPES[type],
    maximumSizeInBytes: UPLOAD_MAX_SIZES[type],
    tokenPayload: clientPayload ?? "{}",
  };
}
