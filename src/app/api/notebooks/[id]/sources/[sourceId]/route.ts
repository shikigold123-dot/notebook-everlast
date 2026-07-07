import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { readVisitorId } from "@/lib/visitor";
import { getNotebook } from "@/db/repo/notebooks";
import { deleteSource } from "@/db/repo/sources";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const { id: notebookId, sourceId } = await params;
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
      { error: "Dossier nicht gefunden." },
      { status: 404 }
    );
  }
  if (notebook.isDemo) {
    return NextResponse.json(
      { error: "Demo-Dossier ist schreibgeschützt." },
      { status: 403 }
    );
  }

  await deleteSource(db, notebookId, sourceId);
  return NextResponse.json({ ok: true });
}
