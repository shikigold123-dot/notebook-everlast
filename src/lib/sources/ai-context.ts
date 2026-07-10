import type { Db } from "@/db";
import { listNotes } from "@/db/repo/notes";
import { listSources } from "@/db/repo/sources";
import type { ChatSource } from "@/lib/chat/openrouter";
import { isUsableContextSource } from "@/lib/sources/context";

function selectedIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((id): id is string => typeof id === "string");
}

export async function buildNotebookAiContext({
  db,
  notebookId,
  visitorId,
  sourceIds,
  noteIds,
}: {
  db: Db;
  notebookId: string;
  visitorId: string;
  sourceIds?: unknown;
  noteIds?: unknown;
}): Promise<ChatSource[]> {
  const wantedSources = selectedIds(sourceIds);
  const wantedNotes = selectedIds(noteIds) ?? [];

  const sources = (await listSources(db, notebookId, visitorId))
    .filter(
      (source) =>
        isUsableContextSource(source) &&
        (wantedSources === null || wantedSources.includes(source.id))
    )
    .map(
      (source, index): ChatSource => ({
        id: source.id,
        label: `S-${String(index + 1).padStart(2, "0")}`,
        title: source.title,
        content: source.content ?? "",
      })
    );

  const notes = (await listNotes(db, notebookId, visitorId))
    .filter((note) => wantedNotes.includes(note.id))
    .map(
      (note, index): ChatSource => ({
        id: note.id,
        label: `N-${String(index + 1).padStart(2, "0")}`,
        title: `Notiz: ${note.title}`,
        content: note.content,
      })
    );

  return [...sources, ...notes];
}
