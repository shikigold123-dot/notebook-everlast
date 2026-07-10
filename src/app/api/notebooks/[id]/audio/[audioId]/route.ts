import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { readVisitorId } from "@/lib/visitor";
import { getNotebook } from "@/db/repo/notebooks";
import { deleteAudioOverview } from "@/db/repo/audio";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; audioId: string }> }
) {
  const { id: notebookId, audioId } = await params;
  const visitorId = readVisitorId(await cookies());
  if (!visitorId) {
    return NextResponse.json(
      { error: "Keine Besucher-Session — bitte Seite neu laden." },
      { status: 401 }
    );
  }

  const db = getDb();
  const notebook = await getNotebook(db, visitorId, notebookId);
  if (!notebook) {
    return NextResponse.json(
      { error: "Notebook nicht gefunden." },
      { status: 404 }
    );
  }
  if (notebook.isDemo) {
    return NextResponse.json(
      { error: "Demo-Notebook ist schreibgeschützt." },
      { status: 403 }
    );
  }

  const success = await deleteAudioOverview(db, notebookId, audioId, visitorId);
  if (!success) {
    return NextResponse.json(
      { error: "Löschen fehlgeschlagen oder nicht autorisiert." },
      { status: 403 }
    );
  }

  return NextResponse.json({ ok: true });
}
