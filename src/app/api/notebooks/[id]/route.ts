import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { readVisitorId } from "@/lib/visitor";
import { deleteNotebook } from "@/db/repo/notebooks";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const visitorId = readVisitorId(await cookies());
  if (!visitorId) {
    return NextResponse.json(
      { error: "Keine Besucher-Session — bitte Seite neu laden." },
      { status: 401 }
    );
  }

  const { id } = await params;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(id)) {
    return NextResponse.json(
      { error: "Notebook nicht gefunden oder keine Berechtigung." },
      { status: 404 }
    );
  }
  try {
    const deleted = await deleteNotebook(getDb(), visitorId, id);
    if (!deleted) {
      return NextResponse.json(
        { error: "Notebook nicht gefunden oder keine Berechtigung." },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, deletedId: id });
  } catch {
    return NextResponse.json(
      { error: "Fehler beim Löschen des Notebooks." },
      { status: 500 }
    );
  }
}
