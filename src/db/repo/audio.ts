import { desc, eq } from "drizzle-orm";
import { audioOverview } from "@/db/schema";
import type { Db } from "@/db";

export type AudioScriptTurn = {
  speaker: "A" | "B";
  text: string;
};

export type AudioOverviewStatus =
  | "queued"
  | "script"
  | "synthesizing"
  | "ready"
  | "error";

export async function getLatestAudioOverview(db: Db, notebookId: string) {
  const rows = await db
    .select()
    .from(audioOverview)
    .where(eq(audioOverview.notebookId, notebookId))
    .orderBy(desc(audioOverview.createdAt), desc(audioOverview.id))
    .limit(1);
  return rows[0] ?? null;
}

export async function createQueuedAudioOverview(db: Db, notebookId: string) {
  const [created] = await db
    .insert(audioOverview)
    .values({
      notebookId,
      status: "queued",
    })
    .returning();
  return created;
}

export async function markAudioScript(
  db: Db,
  id: string,
  script: AudioScriptTurn[]
) {
  const durationS = estimateScriptDuration(script);
  const [updated] = await db
    .update(audioOverview)
    .set({
      status: "script",
      script,
      durationS,
    })
    .where(eq(audioOverview.id, id))
    .returning();
  return updated ?? null;
}

export async function markAudioSynthesizing(db: Db, id: string) {
  const [updated] = await db
    .update(audioOverview)
    .set({ status: "synthesizing" })
    .where(eq(audioOverview.id, id))
    .returning();
  return updated ?? null;
}

export async function markAudioReady(
  db: Db,
  id: string,
  data: { audioBlobUrl: string; durationS: number }
) {
  const [updated] = await db
    .update(audioOverview)
    .set({
      status: "ready",
      audioBlobUrl: data.audioBlobUrl,
      durationS: data.durationS,
    })
    .where(eq(audioOverview.id, id))
    .returning();
  return updated ?? null;
}

export async function markAudioError(
  db: Db,
  id: string,
  message: string,
  script?: AudioScriptTurn[]
) {
  const [updated] = await db
    .update(audioOverview)
    .set({
      status: "error",
      script: script ?? [{ speaker: "A", text: message }],
    })
    .where(eq(audioOverview.id, id))
    .returning();
  return updated ?? null;
}

export function estimateScriptDuration(script: AudioScriptTurn[]) {
  const words = script
    .map((turn) => turn.text.trim().split(/\s+/).filter(Boolean).length)
    .reduce((sum, count) => sum + count, 0);
  return Math.max(1, Math.round((words / 155) * 60));
}
