import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { readVisitorId } from "@/lib/visitor";
import {
  createNotebook,
  listNotebooks,
  LimitExceededError,
} from "@/db/repo/notebooks";

export async function GET() {
  const visitorId = readVisitorId(await cookies());
  if (!visitorId) {
    return NextResponse.json({ notebooks: [] });
  }
  const notebooks = await listNotebooks(getDb(), visitorId);
  return NextResponse.json({ notebooks });
}

export async function POST(request: Request) {
  const visitorId = readVisitorId(await cookies());
  if (!visitorId) {
    return NextResponse.json(
      { error: "Keine Besucher-Session — bitte Seite neu laden." },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const title =
    typeof body?.title === "string" && body.title.trim()
      ? body.title.trim()
      : "Unbenanntes Dossier";

  try {
    const created = await createNotebook(getDb(), visitorId, title);
    return NextResponse.json({ notebook: created }, { status: 201 });
  } catch (err) {
    if (err instanceof LimitExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }
}
