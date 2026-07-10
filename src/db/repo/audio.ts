import { and, desc, eq, or } from "drizzle-orm";
import { audioOverview, notebook } from "@/db/schema";
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

function readableNotebook(visitorId: string) {
  return or(eq(notebook.visitorId, visitorId), eq(notebook.isDemo, true));
}

export async function getLatestAudioOverview(
  db: Db,
  notebookId: string,
  visitorId?: string
) {
  if (visitorId) {
    const rows = await db
      .select({ row: audioOverview })
      .from(audioOverview)
      .innerJoin(notebook, eq(audioOverview.notebookId, notebook.id))
      .where(
        and(
          eq(audioOverview.notebookId, notebookId),
          readableNotebook(visitorId)
        )
      )
      .orderBy(desc(audioOverview.createdAt), desc(audioOverview.id))
      .limit(1);
    return rows[0]?.row ?? null;
  }

  const rows = await db
    .select()
    .from(audioOverview)
    .where(eq(audioOverview.notebookId, notebookId))
    .orderBy(desc(audioOverview.createdAt), desc(audioOverview.id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listAudioOverviews(
  db: Db,
  notebookId: string,
  visitorId?: string
) {
  if (visitorId) {
    const rows = await db
      .select({ row: audioOverview })
      .from(audioOverview)
      .innerJoin(notebook, eq(audioOverview.notebookId, notebook.id))
      .where(
        and(
          eq(audioOverview.notebookId, notebookId),
          readableNotebook(visitorId)
        )
      )
      .orderBy(desc(audioOverview.createdAt), desc(audioOverview.id));
    return rows.map((r) => r.row);
  }

  return db
    .select()
    .from(audioOverview)
    .where(eq(audioOverview.notebookId, notebookId))
    .orderBy(desc(audioOverview.createdAt), desc(audioOverview.id));
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

export async function deleteAudioOverview(
  db: Db,
  notebookId: string,
  audioId: string,
  visitorId: string
) {
  const rows = await db
    .select()
    .from(notebook)
    .where(and(eq(notebook.id, notebookId), eq(notebook.visitorId, visitorId)))
    .limit(1);
  if (rows.length === 0) return false;

  await db
    .delete(audioOverview)
    .where(
      and(eq(audioOverview.id, audioId), eq(audioOverview.notebookId, notebookId))
    );
  return true;
}
