import type { Db } from "@/db";
import { getUsageValue, incrementUsage, type UsageMetric } from "@/db/repo/usage";
import { LIMITS } from "@/lib/limits";

type ExpensiveMetric = Extract<UsageMetric, "chat" | "artifact" | "audio">;

export class UsageLimitExceededError extends Error {}

const METRIC_LABELS: Record<ExpensiveMetric, string> = {
  chat: "Chat-Nachrichten",
  artifact: "Artefakte",
  audio: "Audio Overviews",
};

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function visitorDayScope(visitorId: string, date = new Date()) {
  return `visitor:${visitorId}:${dateKey(date)}`;
}

export function globalDayScope(date = new Date()) {
  return `global:${dateKey(date)}`;
}

function visitorLimitFor(metric: ExpensiveMetric) {
  if (metric === "chat") return LIMITS.chatPerVisitorDay;
  if (metric === "artifact") return LIMITS.artifactsPerVisitorDay;
  return LIMITS.audioPerVisitorDay;
}

async function assertGlobalBudgetOpen(db: Db) {
  const budget = LIMITS.dailyBudgetCents;
  if (budget <= 0) return;

  const used = await getUsageValue(db, globalDayScope(), "est_cost_cents");
  if (used >= budget) {
    throw new UsageLimitExceededError(
      "Das globale Tagesbudget ist erreicht — morgen geht es weiter."
    );
  }
}

async function assertBelowLimit({
  db,
  scope,
  metric,
  limit,
  message,
}: {
  db: Db;
  scope: string;
  metric: ExpensiveMetric;
  limit: number;
  message: string;
}) {
  const used = await getUsageValue(db, scope, metric);
  if (used >= limit) {
    throw new UsageLimitExceededError(message);
  }
}

export async function consumeDailyUsage(
  db: Db,
  visitorId: string,
  metric: ExpensiveMetric
) {
  await assertGlobalBudgetOpen(db);

  const visitorScope = visitorDayScope(visitorId);
  const visitorLimit = visitorLimitFor(metric);
  await assertBelowLimit({
    db,
    scope: visitorScope,
    metric,
    limit: visitorLimit,
    message: `Tageslimit erreicht: maximal ${visitorLimit} ${METRIC_LABELS[metric]} pro Besucher.`,
  });

  if (metric === "audio") {
    const globalLimit = LIMITS.audioGlobalDay;
    await assertBelowLimit({
      db,
      scope: globalDayScope(),
      metric,
      limit: globalLimit,
      message: `Globales Tageslimit erreicht: maximal ${globalLimit} Audio Overviews pro Tag.`,
    });
  }

  const value = await incrementUsage(db, visitorScope, metric);
  if (metric === "audio") {
    await incrementUsage(db, globalDayScope(), metric);
  }
  return value;
}
