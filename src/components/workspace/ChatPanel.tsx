"use client";

import { FormEvent, useState } from "react";
import { ActionButton } from "@/components/ui/ActionButton";
import type { ChatCitation } from "@/db/repo/chat";

export type ChatMessageItem = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: ChatCitation[] | null;
};

type StreamMessage = ChatMessageItem;

function renderAssistantText(
  content: string,
  citations: ChatCitation[] | null,
  onSelectCitation: (citation: ChatCitation) => void
) {
  if (!citations || citations.length === 0) return content;

  const byMarker = new Map(
    citations.map((citation) => [
      citation.marker ?? `[${citation.label}]`,
      citation,
    ])
  );
  const parts = content.split(/(\[S-\d{2}(?:#\d+-\d+)?\])/g);

  return parts.map((part, index) => {
    const citation = byMarker.get(part);
    if (!citation) return <span key={`${part}-${index}`}>{part}</span>;

    return (
      <button
        key={`${part}-${index}`}
        type="button"
        onClick={() => onSelectCitation(citation)}
        className="mx-1 border-[1.5px] border-ink bg-signal px-1 text-xs text-ink"
      >
        [{citation.label}]
      </button>
    );
  });
}

export function ChatPanel({
  notebookId,
  initialMessages,
  readySourceCount,
  onSelectSource,
  readOnly = false,
}: {
  notebookId: string;
  initialMessages: ChatMessageItem[];
  readySourceCount: number;
  onSelectSource?: (sourceId: string, citation?: ChatCitation) => void;
  readOnly?: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages ?? []);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<ChatCitation | null>(
    null
  );

  async function readChatStream(res: Response) {
    const reader = res.body?.getReader();
    if (!reader) {
      setError("Antwort konnte nicht gestreamt werden.");
      return;
    }

    const decoder = new TextDecoder();
    const draftId = `assistant-stream-${Date.now()}`;
    let buffer = "";

    function upsertAssistantDelta(text: string) {
      setMessages((prev) => {
        const exists = prev.some((message) => message.id === draftId);
        const withDraft = exists
          ? prev
          : [
              ...prev,
              {
                id: draftId,
                role: "assistant" as const,
                content: "",
                citations: null,
              },
            ];

        return withDraft.map((message) =>
          message.id === draftId
            ? { ...message, content: message.content + text }
            : message
        );
      });
    }

    function replaceAssistant(message: StreamMessage) {
      setMessages((prev) => {
        if (prev.some((row) => row.id === draftId)) {
          return prev.map((row) => (row.id === draftId ? message : row));
        }
        return [...prev, message];
      });
    }

    function handleBlock(block: string) {
      const lines = block.split("\n");
      const event = lines
        .find((line) => line.startsWith("event: "))
        ?.slice("event: ".length);
      const dataText = lines
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice("data: ".length))
        .join("\n");
      const data = dataText ? JSON.parse(dataText) : {};

      if (event === "user_message") {
        setMessages((prev) => [...prev, data as StreamMessage]);
      }
      if (event === "delta") {
        upsertAssistantDelta(String(data.text ?? ""));
      }
      if (event === "assistant_message") {
        replaceAssistant(data as StreamMessage);
      }
      if (event === "error") {
        setError(String(data.error ?? "Antwort konnte nicht generiert werden."));
      }
    }

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        if (block.trim()) handleBlock(block);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) handleBlock(buffer);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;

    const trimmed = question.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setError(null);
    setSelectedCitation(null);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/chat`, {
        method: "POST",
        headers: {
          accept: "text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify({ question: trimmed }),
      });
      const contentType = res.headers?.get?.("content-type") ?? "";
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Antwort konnte nicht generiert werden.");
        return;
      }
      if (contentType.includes("text/event-stream")) {
        await readChatStream(res);
        setQuestion("");
        return;
      }
      const json = await res.json().catch(() => ({}));
      setMessages((prev) => [
        ...prev,
        json.userMessage,
        json.assistantMessage,
      ]);
      setQuestion("");
    } catch {
      setError("Keine Verbindung — bitte nochmal versuchen.");
    } finally {
      setBusy(false);
    }
  }

  const hasReadySources = readySourceCount > 0;
  const canAsk = hasReadySources && !readOnly;

  function handleSelectCitation(citation: ChatCitation) {
    setSelectedCitation(citation);
    onSelectSource?.(citation.sourceId, citation);
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-sm text-ink/60">
            {readOnly
              ? "Demo-Dossier ist schreibgeschützt."
              : hasReadySources
                ? "Stell eine Frage zu deinen bereiten Quellen."
                : "Füge zuerst eine bereite Quelle hinzu."}
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {messages.map((message) => (
              <li
                key={message.id}
                className="border-[1.5px] border-ink bg-paper p-3 text-sm"
              >
                <p className="label-caps mb-2 text-ink/60">
                  {message.role === "user" ? "Du" : "Everlast"}
                </p>
                <p className="whitespace-pre-wrap leading-6">
                  {message.role === "assistant"
                    ? renderAssistantText(
                        message.content,
                        message.citations,
                        handleSelectCitation
                      )
                    : message.content}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>

      {selectedCitation && (
        <div className="border-[1.5px] border-ink bg-paper px-2 py-1 text-xs">
          <p>
            {selectedCitation.label}: {selectedCitation.title}
          </p>
          {selectedCitation.citedText && (
            <p className="mt-1 max-h-10 overflow-hidden text-ink/70">
              {selectedCitation.citedText}
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="border-[1.5px] border-ink bg-paper px-2 py-1 text-sm">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          disabled={!canAsk || busy}
          placeholder={
            readOnly
              ? "Demo-Dossier ist schreibgeschützt."
              : hasReadySources
              ? "Frag deine Quellen ..."
              : "Warte auf eine bereite Quelle ..."
          }
          rows={3}
          className="border-[1.5px] border-ink bg-paper px-3 py-2 text-sm disabled:opacity-40"
        />
        <ActionButton disabled={!canAsk || busy}>
          {busy ? "Antwort läuft ..." : "Frage stellen"}
        </ActionButton>
      </form>
    </div>
  );
}
