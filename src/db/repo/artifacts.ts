import { and, asc, eq, or } from "drizzle-orm";
import { artifact, notebook } from "@/db/schema";
import type { Db } from "@/db";

export type ArtifactKind =
  | "study_guide"
  | "faq"
  | "timeline"
  | "briefing"
  | "mindmap"
  | "video_overview"
  | "presentation"
  | "flashcards"
  | "quiz"
  | "infographic"
  | "website"
  | "data_table"
  | "glossary";

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
  content: unknown,
  status: "ready" | "error" = "ready"
) {
  const [created] = await db
    .insert(artifact)
    .values({
      notebookId,
      type,
      status,
      content,
    })
    .returning();
  return created;
}

export async function createArtifactError(
  db: Db,
  notebookId: string,
  type: ArtifactKind,
  message: string
) {
  return createArtifact(db, notebookId, type, { message }, "error");
}

export async function deleteArtifact(
  db: Db,
  notebookId: string,
  artifactId: string,
  visitorId: string
) {
  const rows = await db
    .select()
    .from(notebook)
    .where(and(eq(notebook.id, notebookId), eq(notebook.visitorId, visitorId)))
    .limit(1);
  if (rows.length === 0) return false;

  await db
    .delete(artifact)
    .where(and(eq(artifact.id, artifactId), eq(artifact.notebookId, notebookId)));
  return true;
}
