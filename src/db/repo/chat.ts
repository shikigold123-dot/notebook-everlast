import { and, asc, eq, or } from "drizzle-orm";
import { chatMessage, notebook } from "@/db/schema";
import type { Db } from "@/db";

export type ChatCitation = {
  sourceId: string;
  label: string;
  title: string;
  marker?: string;
  start?: number;
  end?: number;
  citedText?: string;
};

function readableNotebook(visitorId: string) {
  return or(eq(notebook.visitorId, visitorId), eq(notebook.isDemo, true));
}

export async function listChatMessages(
  db: Db,
  notebookId: string,
  visitorId?: string
) {
  if (visitorId) {
    const rows = await db
      .select({ row: chatMessage })
      .from(chatMessage)
      .innerJoin(notebook, eq(chatMessage.notebookId, notebook.id))
      .where(
        and(eq(chatMessage.notebookId, notebookId), readableNotebook(visitorId))
      )
      .orderBy(asc(chatMessage.createdAt), asc(chatMessage.id));
    return rows.map((row) => row.row);
  }

  return db
    .select()
    .from(chatMessage)
    .where(eq(chatMessage.notebookId, notebookId))
    .orderBy(asc(chatMessage.createdAt), asc(chatMessage.id));
}

export async function createChatMessage(
  db: Db,
  notebookId: string,
  role: "user" | "assistant",
  content: string,
  citations: ChatCitation[] = []
) {
  const [created] = await db
    .insert(chatMessage)
    .values({
      notebookId,
      role,
      content,
      citations: citations.length > 0 ? citations : null,
    })
    .returning();
  return created;
}
