import { and, asc, count, desc, eq, or } from "drizzle-orm";
import { notebook } from "@/db/schema";
import type { Db } from "@/db";
import { ensureVisitor } from "@/lib/visitor";
import { LIMITS } from "@/lib/limits";

export class LimitExceededError extends Error {}

export async function listNotebooks(db: Db, visitorId: string) {
  return db
    .select()
    .from(notebook)
    .where(eq(notebook.visitorId, visitorId))
    .orderBy(asc(notebook.createdAt), asc(notebook.id));
}

export async function listVisibleNotebooks(db: Db, visitorId: string) {
  return db
    .select()
    .from(notebook)
    .where(or(eq(notebook.visitorId, visitorId), eq(notebook.isDemo, true)))
    .orderBy(desc(notebook.isDemo), asc(notebook.createdAt), asc(notebook.id));
}

export async function createNotebook(
  db: Db,
  visitorId: string,
  title: string
) {
  await ensureVisitor(db, visitorId);

  const [{ value: existing }] = await db
    .select({ value: count() })
    .from(notebook)
    .where(
      and(eq(notebook.visitorId, visitorId), eq(notebook.isDemo, false))
    );

  if (existing >= LIMITS.notebooksPerVisitor) {
    throw new LimitExceededError(
      `Maximal ${LIMITS.notebooksPerVisitor} Dossiers pro Besucher — lösch eins, um Platz zu schaffen.`
    );
  }

  const [created] = await db
    .insert(notebook)
    .values({ visitorId, title })
    .returning();
  return created;
}

export async function getNotebook(db: Db, visitorId: string, id: string) {
  const rows = await db
    .select()
    .from(notebook)
    .where(
      and(
        eq(notebook.id, id),
        or(eq(notebook.visitorId, visitorId), eq(notebook.isDemo, true))
      )
    )
    .limit(1);
  return rows[0] ?? null;
}
