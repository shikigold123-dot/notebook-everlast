import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import {
  createArtifact,
  listArtifacts,
  type ArtifactKind,
} from "@/db/repo/artifacts";
import { getNotebook } from "@/db/repo/notebooks";
import { listSources } from "@/db/repo/sources";
import { readVisitorId } from "@/lib/visitor";
import {
  consumeDailyUsage,
  UsageLimitExceededError,
} from "@/lib/usage/guard";
import {
  ArtifactGenerationError,
  generateArtifactContent,
} from "@/lib/artifacts/openrouter";
import type { ChatSource } from "@/lib/chat/openrouter";

const ARTIFACT_TYPES = [
  "study_guide",
  "faq",
  "timeline",
  "briefing",
  "mindmap",
] as const;

function isArtifactKind(value: unknown): value is ArtifactKind {
  return (
    typeof value === "string" &&
    ARTIFACT_TYPES.includes(value as ArtifactKind)
  );
}

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
    return NextResponse.json({ artifacts: [] });
  }

  const db = getDb();
  const notebook = await getNotebook(db, visitorId, notebookId);
  if (!notebook) {
    return NextResponse.json(
      { error: "Dossier nicht gefunden." },
      { status: 404 }
    );
  }

  const artifacts = await listArtifacts(db, notebookId);
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
  if (!isArtifactKind(body.type)) {
    return NextResponse.json(
      { error: "Unbekannter Artefakt-Typ." },
      { status: 400 }
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

  try {
    await consumeDailyUsage(db, visitorId, "artifact");
    const content = await generateArtifactContent({
      type: body.type,
      sources,
    });
    const artifact = await createArtifact(db, notebookId, body.type, content);

    return NextResponse.json({ artifact }, { status: 201 });
  } catch (err) {
    if (err instanceof UsageLimitExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    if (err instanceof ArtifactGenerationError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    throw err;
  }
}
