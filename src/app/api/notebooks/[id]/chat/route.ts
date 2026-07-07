import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { getNotebook } from "@/db/repo/notebooks";
import { createChatMessage, listChatMessages } from "@/db/repo/chat";
import { listSources } from "@/db/repo/sources";
import { readVisitorId } from "@/lib/visitor";
import {
  consumeDailyUsage,
  UsageLimitExceededError,
} from "@/lib/usage/guard";
import {
  ChatGenerationError,
  extractCitations,
  generateChatAnswer,
  type ChatSource,
} from "@/lib/chat/openrouter";

function labelFor(index: number) {
  return `S-${String(index + 1).padStart(2, "0")}`;
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

  const body = await request.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json(
      { error: "Frage darf nicht leer sein." },
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

  const history = (await listChatMessages(db, notebookId)).map((message) => ({
    role: message.role,
    content: message.content,
  }));

  try {
    await consumeDailyUsage(db, visitorId, "chat");
    const answer = await generateChatAnswer({
      sources,
      history,
      question,
    });
    const citations = extractCitations(answer, sources);

    const userMessage = await createChatMessage(
      db,
      notebookId,
      "user",
      question
    );
    const assistantMessage = await createChatMessage(
      db,
      notebookId,
      "assistant",
      answer,
      citations
    );

    return NextResponse.json({
      userMessage,
      assistantMessage,
    });
  } catch (err) {
    if (err instanceof UsageLimitExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    if (err instanceof ChatGenerationError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    throw err;
  }
}
