function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? NaN : parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Spec Abschnitt 7 — alle Werte per Env-Variable übersteuerbar. */
export const LIMITS = {
  get notebooksPerVisitor() {
    return intFromEnv("LIMIT_NOTEBOOKS_PER_VISITOR", 5);
  },
  get sourcesPerNotebook() {
    return intFromEnv("LIMIT_SOURCES_PER_NOTEBOOK", 8);
  },
  get tokensPerNotebook() {
    return intFromEnv("LIMIT_TOKENS_PER_NOTEBOOK", 100_000);
  },
  get chatPerVisitorDay() {
    return intFromEnv("LIMIT_CHAT_PER_VISITOR_DAY", 30);
  },
  get artifactsPerVisitorDay() {
    return intFromEnv("LIMIT_ARTIFACTS_PER_VISITOR_DAY", 10);
  },
};
