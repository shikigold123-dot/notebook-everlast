import { and, asc, count, eq } from "drizzle-orm";
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
    .where(eq(notebook.id, id))
    .limit(1);
  const nb = rows[0];
  if (!nb) return null;
  if (nb.visitorId !== visitorId && !nb.isDemo) return null;
  return nb;
}
