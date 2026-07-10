import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { deleteNote, updateNote } from "@/db/repo/notes";
import { readVisitorId } from "@/lib/visitor";

type Context = { params: Promise<{ id: string; noteId: string }> };

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function PATCH(request: Request, { params }: Context) {
  const { id, noteId } = await params;
  const visitorId = readVisitorId(await cookies());
  if (!visitorId) {
    return NextResponse.json({ error: "Keine Besucher-Session — bitte Seite neu laden." }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const title = clean(body.title, 160);
  const content = clean(body.content, 30_000);
  if (!title || !content) {
    return NextResponse.json({ error: "Titel und Inhalt dürfen nicht leer sein." }, { status: 400 });
  }
  const updated = await updateNote(getDb(), id, noteId, visitorId, { title, content });
  if (!updated) {
    return NextResponse.json({ error: "Notiz nicht gefunden oder schreibgeschützt." }, { status: 404 });
  }
  return NextResponse.json({ note: updated });
}

export async function DELETE(_request: Request, { params }: Context) {
  const { id, noteId } = await params;
  const visitorId = readVisitorId(await cookies());
  if (!visitorId) {
    return NextResponse.json({ error: "Keine Besucher-Session — bitte Seite neu laden." }, { status: 401 });
  }
  const deleted = await deleteNote(getDb(), id, noteId, visitorId);
  if (!deleted) {
    return NextResponse.json({ error: "Notiz nicht gefunden oder schreibgeschützt." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
