import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import {
  createQueuedAudioOverview,
  getLatestAudioOverview,
  markAudioError,
  markAudioReady,
  markAudioScript,
  markAudioSynthesizing,
} from "@/db/repo/audio";
import { getNotebook } from "@/db/repo/notebooks";
import { listSources } from "@/db/repo/sources";
import { readVisitorId } from "@/lib/visitor";
import {
  consumeDailyUsage,
  UsageLimitExceededError,
} from "@/lib/usage/guard";
import {
  AudioGenerationError,
  generateAudioScript,
} from "@/lib/audio/openrouter";
import {
  AudioSynthesisError,
  isAudioTtsConfigured,
  synthesizeAudioOverview,
} from "@/lib/audio/tts";
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

  const audioOverview = await getLatestAudioOverview(db, notebookId, visitorId);
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

  const existing = await getLatestAudioOverview(db, notebookId, visitorId);
  if (existing && existing.status !== "error") {
    return NextResponse.json(
      { error: "Audio Overview existiert bereits." },
      { status: 409 }
    );
  }

  const sources = (await listSources(db, notebookId, visitorId))
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

  try {
    await consumeDailyUsage(db, visitorId, "audio");
  } catch (err) {
    if (err instanceof UsageLimitExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }

  const created = await createQueuedAudioOverview(db, notebookId);
  let generatedScript:
    | Awaited<ReturnType<typeof generateAudioScript>>
    | undefined;

  try {
    generatedScript = await generateAudioScript({ sources });
    let audioOverview = await markAudioScript(db, created.id, generatedScript);

    if (isAudioTtsConfigured()) {
      audioOverview = await markAudioSynthesizing(db, created.id);
      const audio = await synthesizeAudioOverview({
        notebookId,
        audioOverviewId: created.id,
        script: generatedScript,
      });
      audioOverview = await markAudioReady(db, created.id, audio);
    }

    return NextResponse.json({ audioOverview }, { status: 201 });
  } catch (err) {
    if (err instanceof AudioGenerationError) {
      const audioOverview = await markAudioError(db, created.id, err.message);
      return NextResponse.json(
        { error: err.message, audioOverview },
        { status: 502 }
      );
    }
    if (err instanceof AudioSynthesisError) {
      const audioOverview = await markAudioError(
        db,
        created.id,
        err.message,
        generatedScript
      );
      return NextResponse.json(
        { error: err.message, audioOverview },
        { status: 502 }
      );
    }
    throw err;
  }
}
