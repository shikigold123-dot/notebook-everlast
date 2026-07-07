import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { readVisitorId } from "@/lib/visitor";
import { getNotebook, LimitExceededError } from "@/db/repo/notebooks";
import { createSource, listSources } from "@/db/repo/sources";
import { countTokens } from "@/lib/ingestion/tokens";
import { processSource } from "@/lib/ingestion/process";

const KNOWN_TYPES = ["text", "pdf", "url", "youtube", "audio"];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: notebookId } = await params;
  const visitorId = readVisitorId(await cookies());
  if (!visitorId) {
    return NextResponse.json({ sources: [] });
  }
  const db = getDb();
  const notebook = await getNotebook(db, visitorId, notebookId);
  if (!notebook) {
    return NextResponse.json({ sources: [] });
  }
  const sources = await listSources(db, notebookId);
  return NextResponse.json({ sources });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: notebookId } = await params;
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

  const body = await request.json().catch(() => ({}));
  const type = body?.type;

  if (!KNOWN_TYPES.includes(type)) {
    return NextResponse.json(
      { error: "Unbekannter Quellentyp." },
      { status: 400 }
    );
  }

  try {
    if (type === "text") {
      const content =
        typeof body.content === "string" ? body.content.trim() : "";
      if (!content) {
        return NextResponse.json(
          { error: "Text darf nicht leer sein." },
          { status: 400 }
        );
      }
      const tokenCount = await countTokens(content);
      const created = await createSource(db, notebookId, {
        type: "text",
        title:
          typeof body.title === "string" && body.title.trim()
            ? body.title.trim()
            : "Unbenannter Text",
        content,
        tokenCount,
      });
      return NextResponse.json({ source: created }, { status: 201 });
    }

    if (type === "url" || type === "youtube") {
      const originalUrl =
        typeof body.originalUrl === "string" ? body.originalUrl.trim() : "";
      if (!originalUrl) {
        return NextResponse.json(
          { error: "URL darf nicht leer sein." },
          { status: 400 }
        );
      }
      const created = await createSource(db, notebookId, {
        type,
        title: "Wird geladen …",
        originalUrl,
      });
      after(() => processSource(getDb(), notebookId, created.id));
      return NextResponse.json({ source: created }, { status: 201 });
    }

    // pdf / audio
    const blobUrl = typeof body.blobUrl === "string" ? body.blobUrl.trim() : "";
    if (!blobUrl) {
      return NextResponse.json(
        { error: "Datei-URL fehlt." },
        { status: 400 }
      );
    }
    const created = await createSource(db, notebookId, {
      type,
      title:
        typeof body.title === "string" && body.title.trim()
          ? body.title.trim()
          : "Unbenannte Datei",
      blobUrl,
    });
    after(() => processSource(getDb(), notebookId, created.id));
    return NextResponse.json({ source: created }, { status: 201 });
  } catch (err) {
    if (err instanceof LimitExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }
}
