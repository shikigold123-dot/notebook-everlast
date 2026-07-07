import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import {
  createQueuedAudioOverview,
  getLatestAudioOverview,
  markAudioError,
  markAudioScript,
} from "@/db/repo/audio";
import { getNotebook } from "@/db/repo/notebooks";
import { listSources } from "@/db/repo/sources";
import { readVisitorId } from "@/lib/visitor";
import {
  AudioGenerationError,
  generateAudioScript,
} from "@/lib/audio/openrouter";
import type { ChatSource } from "@/lib/chat/openrouter";

function labelFor(index: number) {
  return `S-${String(index + 1).padStart(2, "0")}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: notebookId } = await params;
  const visitorId = readVisitorId(await cookies());
  if (!visitorId) {
    return NextResponse.json({ audioOverview: null });
  }

  const db = getDb();
  const notebook = await getNotebook(db, visitorId, notebookId);
  if (!notebook) {
    return NextResponse.json(
      { error: "Dossier nicht gefunden." },
      { status: 404 }
    );
  }

  const audioOverview = await getLatestAudioOverview(db, notebookId);
  return NextResponse.json({ audioOverview });
}

export async function POST(
  _request: Request,
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

  const existing = await getLatestAudioOverview(db, notebookId);
  if (existing && existing.status !== "error") {
    return NextResponse.json(
      { error: "Audio Overview existiert bereits." },
      { status: 409 }
    );
  }

  const sources = (await listSources(db, notebookId))
    .filter((source) => source.status === "ready" && source.content?.trim())
    .map(
      (source, index): ChatSource => ({
        id: source.id,
        label: labelFor(index),
        title: source.title,
        content: source.content ?? "",
      })
    );

  if (sources.length === 0) {
    return NextResponse.json(
      { error: "Füge zuerst eine bereite Quelle hinzu." },
      { status: 400 }
    );
  }

  const created = await createQueuedAudioOverview(db, notebookId);

  try {
    const script = await generateAudioScript({ sources });
    const audioOverview = await markAudioScript(db, created.id, script);
    return NextResponse.json({ audioOverview }, { status: 201 });
  } catch (err) {
    if (err instanceof AudioGenerationError) {
      const audioOverview = await markAudioError(db, created.id, err.message);
      return NextResponse.json(
        { error: err.message, audioOverview },
        { status: 502 }
      );
    }
    throw err;
  }
}
