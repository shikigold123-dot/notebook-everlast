/**
 * Geteilte Bausteine für die Studio-Output-Anpassung (Detailgrad, Freitext).
 * Wird von den Artefakt- und Audio-Prompt-Buildern sowie den zugehörigen
 * API-Routen genutzt, damit Validierung/Whitelisting an einer Stelle lebt.
 */
export type DetailLevel = "brief" | "standard" | "detailed";

const DETAIL_LEVELS: readonly DetailLevel[] = ["brief", "standard", "detailed"];

export function isDetailLevel(value: unknown): value is DetailLevel {
  return typeof value === "string" && (DETAIL_LEVELS as readonly string[]).includes(value);
}

export function sanitizeText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
