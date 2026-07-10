type ContextSourceLike = {
  id: string;
  type: string;
  status: string;
  content: string | null;
  meta: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasYoutubeTranscript(meta: unknown) {
  const record = asRecord(meta);
  return (
    record.transcriptAvailable === true ||
    typeof record.transcriptSource === "string"
  );
}

function looksLikeYoutubeMetadataOnly(content: string) {
  const normalized = content.toLowerCase();
  return (
    normalized.includes("metadaten") ||
    (normalized.includes("youtube") &&
      normalized.includes("transkript") &&
      normalized.includes("nicht verfügbar"))
  );
}

export function isUsableContextSource(source: ContextSourceLike) {
  const content = source.content?.trim() ?? "";
  if (source.status !== "ready" || !content) return false;

  if (source.type === "youtube") {
    return (
      hasYoutubeTranscript(source.meta) && !looksLikeYoutubeMetadataOnly(content)
    );
  }

  return true;
}

export function isStaleYoutubeMetadataAnswer(content: string) {
  const normalized = content.toLowerCase();
  return (
    normalized.includes("metadaten von youtube") ||
    (normalized.includes("youtube-videos") &&
      normalized.includes("kein transkript"))
  );
}
