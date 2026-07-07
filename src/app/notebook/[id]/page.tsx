import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { readVisitorId, UUID_RE } from "@/lib/visitor";
import { getNotebook, listNotebooks } from "@/db/repo/notebooks";
import { listSources } from "@/db/repo/sources";
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

  const sources = await listSources(db, nb.id);

  return (
    <NotebookWorkspace
      notebook={{
        id: nb.id,
        title: nb.title,
        number: String(position).padStart(3, "0"),
      }}
      sources={sources.map((s) => ({
        id: s.id,
        type: s.type,
        status: s.status,
        title: s.title,
        errorMessage: s.errorMessage,
      }))}
    />
  );
}
