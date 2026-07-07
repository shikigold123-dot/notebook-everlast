import { and, eq, sql } from "drizzle-orm";
import { usageCounter } from "@/db/schema";
import type { Db } from "@/db";

export type UsageMetric = "chat" | "artifact" | "audio" | "est_cost_cents";

export async function getUsageValue(
  db: Db,
  scope: string,
  metric: UsageMetric
) {
  const rows = await db
    .select({ value: usageCounter.value })
    .from(usageCounter)
    .where(and(eq(usageCounter.scope, scope), eq(usageCounter.metric, metric)))
    .limit(1);
  return rows[0]?.value ?? 0;
}

export async function incrementUsage(
  db: Db,
  scope: string,
  metric: UsageMetric,
  by = 1
) {
  const [row] = await db
    .insert(usageCounter)
    .values({ scope, metric, value: by })
    .onConflictDoUpdate({
      target: [usageCounter.scope, usageCounter.metric],
      set: {
        value: sql`${usageCounter.value} + ${by}`,
      },
    })
    .returning({ value: usageCounter.value });
  return row.value;
}
