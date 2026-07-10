import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import {
  createArtifact,
  createArtifactError,
  listArtifacts,
  type ArtifactKind,
} from "@/db/repo/artifacts";
import { getNotebook } from "@/db/repo/notebooks";
import { readVisitorId } from "@/lib/visitor";
import {
  consumeDailyUsage,
  UsageLimitExceededError,
} from "@/lib/usage/guard";
import {
  ArtifactGenerationError,
  generateArtifactContent,
  isVisualStyleKey,
  type ArtifactCustomization,
} from "@/lib/artifacts/openrouter";
import { isDetailLevel, sanitizeText } from "@/lib/generation/customization";
import { buildNotebookAiContext } from "@/lib/sources/ai-context";

const ARTIFACT_TYPES = [
  "study_guide",
  "faq",
  "timeline",
  "briefing",
  "mindmap",
  "video_overview",
  "presentation",
  "flashcards",
  "quiz",
  "infographic",
  "website",
  "data_table",
  "glossary",
] as const;

function isArtifactKind(value: unknown): value is ArtifactKind {
  return (
    typeof value === "string" &&
    ARTIFACT_TYPES.includes(value as ArtifactKind)
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: notebookId } = await params;
  const visitorId = readVisitorId(await cookies());
  if (!visitorId) {
    return NextResponse.json({ artifacts: [] });
  }

  const db = getDb();
  const notebook = await getNotebook(db, visitorId, notebookId);
  if (!notebook) {
    return NextResponse.json(
      { error: "Notebook nicht gefunden." },
      { status: 404 }
    );
  }

  const artifacts = await listArtifacts(db, notebookId, visitorId);
  return NextResponse.json({ artifacts });
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

  const body = await request.json().catch(() => ({}));
  if (!isArtifactKind(body.type)) {
    return NextResponse.json(
      { error: "Unbekannter Artefakt-Typ." },
      { status: 400 }
    );
  }

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

  const customization: ArtifactCustomization = {
    ...(isDetailLevel(body.detailLevel) ? { detailLevel: body.detailLevel } : {}),
    ...(sanitizeText(body.customInstructions, 400)
      ? { customInstructions: sanitizeText(body.customInstructions, 400) }
      : {}),
    ...(body.type === "infographic" && isVisualStyleKey(body.visualStyle)
      ? { visualStyle: body.visualStyle }
      : {}),
  };

  try {
    await consumeDailyUsage(db, visitorId, "artifact");
    const content = await generateArtifactContent({
      type: body.type,
      sources,
      ...(Object.keys(customization).length > 0 ? { customization } : {}),
    });
    const artifact = await createArtifact(db, notebookId, body.type, content);

    return NextResponse.json({ artifact }, { status: 201 });
  } catch (err) {
    if (err instanceof UsageLimitExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    if (err instanceof ArtifactGenerationError) {
      const artifact = await createArtifactError(
        db,
        notebookId,
        body.type,
        err.message
      );
      return NextResponse.json(
        { error: err.message, artifact },
        { status: 502 }
      );
    }
    throw err;
  }
}
