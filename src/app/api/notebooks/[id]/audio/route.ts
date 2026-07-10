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
import { readVisitorId } from "@/lib/visitor";
import {
  consumeDailyUsage,
  UsageLimitExceededError,
} from "@/lib/usage/guard";
import {
  AudioGenerationError,
  generateAudioScript,
  type AudioCustomization,
} from "@/lib/audio/openrouter";
import {
  AudioSynthesisError,
  isAudioTtsConfigured,
  synthesizeAudioOverview,
} from "@/lib/audio/tts";
import type { AudioScriptTurn } from "@/db/repo/audio";
import { isDetailLevel, sanitizeText } from "@/lib/generation/customization";
import { buildNotebookAiContext } from "@/lib/sources/ai-context";

function isAudioScriptTurn(value: unknown): value is AudioScriptTurn {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      ((value as { speaker?: unknown }).speaker === "A" ||
        (value as { speaker?: unknown }).speaker === "B") &&
      typeof (value as { text?: unknown }).text === "string" &&
      (value as { text: string }).text.trim()
  );
}

function readAudioScript(value: unknown) {
  return Array.isArray(value) ? value.filter(isAudioScriptTurn) : [];
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
      { error: "Notebook nicht gefunden." },
      { status: 404 }
    );
  }

  const audioOverview = await getLatestAudioOverview(db, notebookId, visitorId);
  return NextResponse.json({ audioOverview });
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

  const existing = await getLatestAudioOverview(db, notebookId, visitorId);
  const existingScript = readAudioScript(existing?.script);
  if (
    existing &&
    existing.status === "script" &&
    existingScript.length > 0
  ) {
    if (!isAudioTtsConfigured()) {
      return NextResponse.json(
        {
          error:
            "Audio-Skript ist bereit. Für eine echte TTS-Audiodatei fehlt noch OPENAI_API_KEY oder ElevenLabs-Konfiguration.",
          audioOverview: existing,
        },
        { status: 409 }
      );
    }

    try {
      let audioOverview = await markAudioSynthesizing(db, existing.id);
      const audio = await synthesizeAudioOverview({
        notebookId,
        audioOverviewId: existing.id,
        script: existingScript,
      });
      audioOverview = await markAudioReady(db, existing.id, audio);
      return NextResponse.json({ audioOverview }, { status: 200 });
    } catch (err) {
      if (err instanceof AudioSynthesisError) {
        const audioOverview = await markAudioError(
          db,
          existing.id,
          err.message,
          existingScript
        );
        return NextResponse.json(
          { error: err.message, audioOverview },
          { status: 502 }
        );
      }
      throw err;
    }
  }

  if (existing && (existing.status === "queued" || existing.status === "synthesizing")) {
    return NextResponse.json(
      { error: "Audio-Generierung läuft bereits." },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const customization: AudioCustomization = {
    ...(isDetailLevel(body.detailLevel) ? { detailLevel: body.detailLevel } : {}),
    ...(sanitizeText(body.customInstructions, 400)
      ? { customInstructions: sanitizeText(body.customInstructions, 400) }
      : {}),
    ...(sanitizeText(body.speakerA, 80)
      ? { speakerA: sanitizeText(body.speakerA, 80) }
      : {}),
    ...(sanitizeText(body.speakerB, 80)
      ? { speakerB: sanitizeText(body.speakerB, 80) }
      : {}),
  };

  const sources = await buildNotebookAiContext({
    db,
    notebookId,
    visitorId,
    sourceIds: body.sourceIds,
    noteIds: body.noteIds,
  });

  if (sources.length === 0) {
    return NextResponse.json(
      { error: "Wähle mindestens eine bereite Quelle oder Notiz aus." },
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
    generatedScript = await generateAudioScript({
      sources,
      ...(Object.keys(customization).length > 0 ? { customization } : {}),
    });
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
