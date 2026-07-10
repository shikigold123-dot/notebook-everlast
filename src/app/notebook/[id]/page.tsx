import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { readVisitorId, UUID_RE } from "@/lib/visitor";
import {
  listAudioOverviews,
  type AudioScriptTurn,
} from "@/db/repo/audio";
import { getNotebook, listNotebooks } from "@/db/repo/notebooks";
import { listArtifacts } from "@/db/repo/artifacts";
import { listChatMessages, type ChatCitation } from "@/db/repo/chat";
import { listSources } from "@/db/repo/sources";
import { listNotes } from "@/db/repo/notes";
import { NotebookWorkspace } from "@/components/workspace/NotebookWorkspace";

export const dynamic = "force-dynamic";

export default async function NotebookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const visitorId = readVisitorId(await cookies());
  if (!visitorId || !UUID_RE.test(id)) notFound();

  const db = getDb();
  const nb = await getNotebook(db, visitorId, id);
  if (!nb) notFound();

  // Laufende Nummer = Position in der Liste des Besitzers
  const all = await listNotebooks(db, nb.visitorId);
  const position = all.findIndex((n) => n.id === nb.id) + 1;

  const sources = await listSources(db, nb.id, visitorId);
  const chatMessages = await listChatMessages(db, nb.id, visitorId);
  const artifacts = await listArtifacts(db, nb.id, visitorId);
  const audioOverviews = await listAudioOverviews(db, nb.id, visitorId);
  const notes = await listNotes(db, nb.id, visitorId);

  return (
    <NotebookWorkspace
      notebook={{
        id: nb.id,
        title: nb.title,
        isDemo: nb.isDemo,
        number: String(position).padStart(3, "0"),
      }}
      sources={sources.map((s) => ({
        id: s.id,
        type: s.type,
        status: s.status,
        title: s.title,
        errorMessage: s.errorMessage,
        originalUrl: s.originalUrl,
        meta: s.meta,
      }))}
      chatMessages={chatMessages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        citations: (message.citations as ChatCitation[] | null) ?? null,
      }))}
      artifacts={artifacts.map((item) => ({
        id: item.id,
        type: item.type,
        status: item.status,
        content: item.content,
        createdAt: item.createdAt.toISOString(),
      }))}
      audioOverviews={audioOverviews.map((audioOverview) => ({
        id: audioOverview.id,
        status: audioOverview.status,
        script: (audioOverview.script as AudioScriptTurn[] | null) ?? null,
        audioBlobUrl: audioOverview.audioBlobUrl,
        durationS: audioOverview.durationS,
        createdAt: audioOverview.createdAt.toISOString(),
      }))}
      notes={notes.map((note) => ({
        id: note.id,
        title: note.title,
        content: note.content,
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString(),
      }))}
    />
  );
}
