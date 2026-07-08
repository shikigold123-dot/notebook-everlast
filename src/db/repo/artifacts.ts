import { and, asc, eq, or } from "drizzle-orm";
import { artifact, notebook } from "@/db/schema";
import type { Db } from "@/db";

export type ArtifactKind =
  | "study_guide"
  | "faq"
  | "timeline"
  | "briefing"
  | "mindmap";

function readableNotebook(visitorId: string) {
  return or(eq(notebook.visitorId, visitorId), eq(notebook.isDemo, true));
}

export async function listArtifacts(
  db: Db,
  notebookId: string,
  visitorId?: string
) {
  if (visitorId) {
    const rows = await db
      .select({ row: artifact })
      .from(artifact)
      .innerJoin(notebook, eq(artifact.notebookId, notebook.id))
      .where(
        and(eq(artifact.notebookId, notebookId), readableNotebook(visitorId))
      )
      .orderBy(asc(artifact.createdAt), asc(artifact.id));
    return rows.map((row) => row.row);
  }

  return db
    .select()
    .from(artifact)
    .where(eq(artifact.notebookId, notebookId))
    .orderBy(asc(artifact.createdAt), asc(artifact.id));
}

export async function createArtifact(
  db: Db,
  notebookId: string,
  type: ArtifactKind,
  content: unknown
) {
  const [created] = await db
    .insert(artifact)
    .values({
      notebookId,
      type,
      status: "ready",
      content,
    })
    .returning();
  return created;
}
