import { asc, eq } from "drizzle-orm";
import { artifact } from "@/db/schema";
import type { Db } from "@/db";

export type ArtifactKind =
  | "study_guide"
  | "faq"
  | "timeline"
  | "briefing"
  | "mindmap";

export async function listArtifacts(db: Db, notebookId: string) {
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
