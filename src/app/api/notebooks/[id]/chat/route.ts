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

function wantsEventStream(request: Request) {
  return request.headers.get("accept")?.includes("text/event-stream") ?? false;
}

function encodeEvent(event: string, data: unknown) {
  return new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  );
}

function splitAnswer(answer: string) {
  return answer.match(/.{1,96}(?:\s|$)/g) ?? [answer];
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
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json(
      { error: "Frage darf nicht leer sein." },
      { status: 400 }
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

  const history = (await listChatMessages(db, notebookId, visitorId)).map(
    (message) => ({
      role: message.role,
      content: message.content,
    })
  );

  try {
    await consumeDailyUsage(db, visitorId, "chat");
  } catch (err) {
    if (err instanceof UsageLimitExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }

  if (wantsEventStream(request)) {
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const userMessage = await createChatMessage(
            db,
            notebookId,
            "user",
            question
          );
          controller.enqueue(encodeEvent("user_message", userMessage));

          const answer = await generateChatAnswer({
            sources,
            history,
            question,
          });
          for (const text of splitAnswer(answer)) {
            controller.enqueue(encodeEvent("delta", { text }));
          }

          const citations = extractCitations(answer, sources);
          const assistantMessage = await createChatMessage(
            db,
            notebookId,
            "assistant",
            answer,
            citations
          );
          controller.enqueue(
            encodeEvent("assistant_message", assistantMessage)
          );
          controller.enqueue(encodeEvent("done", {}));
        } catch (err) {
          const message =
            err instanceof ChatGenerationError
              ? err.message
              : "Antwort konnte nicht generiert werden — bitte später nochmal versuchen.";
          controller.enqueue(encodeEvent("error", { error: message }));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  }

  try {
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
    if (err instanceof ChatGenerationError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    throw err;
  }
}
