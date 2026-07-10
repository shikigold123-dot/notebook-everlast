import { and, asc, eq, or } from "drizzle-orm";
import type { Db } from "@/db";
import { note, notebook } from "@/db/schema";

async function ownsNotebook(db: Db, notebookId: string, visitorId: string) {
  const rows = await db
    .select({ id: notebook.id })
    .from(notebook)
    .where(
      and(
        eq(notebook.id, notebookId),
        eq(notebook.visitorId, visitorId),
        eq(notebook.isDemo, false)
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function listNotes(db: Db, notebookId: string, visitorId: string) {
  const rows = await db
    .select({ row: note })
    .from(note)
    .innerJoin(notebook, eq(note.notebookId, notebook.id))
    .where(
      and(
        eq(note.notebookId, notebookId),
        eq(notebook.id, notebookId),
        or(eq(notebook.visitorId, visitorId), eq(notebook.isDemo, true))
      )
    )
    .orderBy(asc(note.createdAt), asc(note.id));
  return rows.map(({ row }) => row);
}

export async function createNote(
  db: Db,
  notebookId: string,
  visitorId: string,
  input: { title: string; content: string }
) {
  if (!(await ownsNotebook(db, notebookId, visitorId))) return null;
  const [created] = await db
    .insert(note)
    .values({ notebookId, title: input.title, content: input.content })
    .returning();
  return created;
}

export async function updateNote(
  db: Db,
  notebookId: string,
  noteId: string,
  visitorId: string,
  input: { title: string; content: string }
) {
  if (!(await ownsNotebook(db, notebookId, visitorId))) return null;
  const [updated] = await db
    .update(note)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(note.id, noteId), eq(note.notebookId, notebookId)))
    .returning();
  return updated ?? null;
}

export async function deleteNote(
  db: Db,
  notebookId: string,
  noteId: string,
  visitorId: string
) {
  if (!(await ownsNotebook(db, notebookId, visitorId))) return null;
  const [deleted] = await db
    .delete(note)
    .where(and(eq(note.id, noteId), eq(note.notebookId, notebookId)))
    .returning();
  return deleted ?? null;
}
