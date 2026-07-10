import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { createNote, listNotes } from "@/db/repo/notes";
import { getNotebook } from "@/db/repo/notebooks";
import { readVisitorId } from "@/lib/visitor";

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const visitorId = readVisitorId(await cookies());
  if (!visitorId) return NextResponse.json({ notes: [] });
  const db = getDb();
  if (!(await getNotebook(db, visitorId, id))) {
    return NextResponse.json({ error: "Notebook nicht gefunden." }, { status: 404 });
  }
  return NextResponse.json({ notes: await listNotes(db, id, visitorId) });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
  const created = await createNote(getDb(), id, visitorId, { title, content });
  if (!created) {
    return NextResponse.json({ error: "Notebook nicht gefunden oder schreibgeschützt." }, { status: 403 });
  }
  return NextResponse.json({ note: created }, { status: 201 });
}
