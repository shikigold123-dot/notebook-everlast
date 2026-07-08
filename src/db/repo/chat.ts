import { asc, eq } from "drizzle-orm";
import { chatMessage } from "@/db/schema";
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

export async function listChatMessages(db: Db, notebookId: string) {
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
