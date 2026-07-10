import { and, asc, count, eq, ne, or } from "drizzle-orm";
import { notebook, source } from "@/db/schema";
import type { Db } from "@/db";
import { LIMITS } from "@/lib/limits";
import { LimitExceededError } from "./notebooks";

export type NewSourceInput = {
  type: "text" | "pdf" | "url" | "youtube" | "audio" | "research";
  title: string;
  content?: string;
  tokenCount?: number;
  originalUrl?: string;
  blobUrl?: string;
  meta?: unknown;
};

function readableNotebook(visitorId: string) {
  return or(eq(notebook.visitorId, visitorId), eq(notebook.isDemo, true));
}

export async function listSources(
  db: Db,
  notebookId: string,
  visitorId?: string
) {
  if (visitorId) {
    const rows = await db
      .select({ row: source })
      .from(source)
      .innerJoin(notebook, eq(source.notebookId, notebook.id))
      .where(and(eq(source.notebookId, notebookId), readableNotebook(visitorId)))
      .orderBy(asc(source.createdAt), asc(source.id));
    return rows.map((row) => row.row);
  }

  return db
    .select()
    .from(source)
    .where(eq(source.notebookId, notebookId))
    .orderBy(asc(source.createdAt), asc(source.id));
}

export async function getSource(
  db: Db,
  notebookId: string,
  sourceId: string,
  visitorId?: string
) {
  if (visitorId) {
    const rows = await db
      .select({ row: source })
      .from(source)
      .innerJoin(notebook, eq(source.notebookId, notebook.id))
      .where(
        and(
          eq(source.id, sourceId),
          eq(source.notebookId, notebookId),
          readableNotebook(visitorId)
        )
      )
      .limit(1);
    return rows[0]?.row ?? null;
  }

  const rows = await db
    .select()
    .from(source)
    .where(and(eq(source.id, sourceId), eq(source.notebookId, notebookId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getReadyTokenTotal(
  db: Db,
  notebookId: string,
  exceptSourceId?: string
) {
  const rows = await db
    .select({ tokenCount: source.tokenCount })
    .from(source)
    .where(
      and(
        eq(source.notebookId, notebookId),
        eq(source.status, "ready"),
        exceptSourceId ? ne(source.id, exceptSourceId) : undefined
      )
    );

  return rows.reduce((sum, row) => sum + (row.tokenCount ?? 0), 0);
}

export async function createSource(
  db: Db,
  notebookId: string,
  input: NewSourceInput
) {
  const [{ value: existing }] = await db
    .select({ value: count() })
    .from(source)
    .where(eq(source.notebookId, notebookId));

  if (existing >= LIMITS.sourcesPerNotebook) {
    throw new LimitExceededError(
      `Maximal ${LIMITS.sourcesPerNotebook} Quellen pro Notebook — lösch eine, um Platz zu schaffen.`
    );
  }

  if (input.type === "text" && input.tokenCount !== undefined) {
    const existingTokens = await getReadyTokenTotal(db, notebookId);
    if (existingTokens + input.tokenCount > LIMITS.tokensPerNotebook) {
      throw new LimitExceededError(
        `Dieses Notebook überschreitet damit das Token-Limit von ${LIMITS.tokensPerNotebook.toLocaleString(
          "de-DE"
        )} Tokens.`
      );
    }
  }

  const [created] = await db
    .insert(source)
    .values({
      notebookId,
      type: input.type,
      title: input.title,
      status: input.type === "text" ? "ready" : "pending",
      content: input.content ?? null,
      tokenCount: input.tokenCount ?? null,
      originalUrl: input.originalUrl ?? null,
      blobUrl: input.blobUrl ?? null,
      meta: input.meta ?? null,
    })
    .returning();
  return created;
}

export async function deleteSource(
  db: Db,
  notebookId: string,
  sourceId: string,
  visitorId?: string
) {
  if (visitorId) {
    const existing = await getSource(db, notebookId, sourceId, visitorId);
    if (!existing) return;
  }

  await db
    .delete(source)
    .where(and(eq(source.id, sourceId), eq(source.notebookId, notebookId)));
}

export async function markProcessing(db: Db, sourceId: string) {
  await db
    .update(source)
    .set({ status: "processing" })
    .where(eq(source.id, sourceId));
}

export async function markReady(
  db: Db,
  sourceId: string,
  data: { content: string; tokenCount: number; meta?: unknown; title?: string }
) {
  await db
    .update(source)
    .set({
      status: "ready",
      content: data.content,
      tokenCount: data.tokenCount,
      meta: data.meta ?? null,
      ...(data.title ? { title: data.title } : {}),
    })
    .where(eq(source.id, sourceId));
}

export async function markError(db: Db, sourceId: string, message: string) {
  await db
    .update(source)
    .set({ status: "error", errorMessage: message })
    .where(eq(source.id, sourceId));
}

export async function retrySource(
  db: Db,
  notebookId: string,
  sourceId: string,
  visitorId?: string
) {
  if (visitorId) {
    const existing = await getSource(db, notebookId, sourceId, visitorId);
    if (!existing) return null;
  }

  const [updated] = await db
    .update(source)
    .set({ status: "pending", errorMessage: null })
    .where(and(eq(source.id, sourceId), eq(source.notebookId, notebookId)))
    .returning();
  return updated ?? null;
}
