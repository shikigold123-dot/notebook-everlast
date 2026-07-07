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

function renderAssistantText(
  content: string,
  citations: ChatCitation[] | null,
  onSelectCitation: (citation: ChatCitation) => void
) {
  if (!citations || citations.length === 0) return content;

  const byLabel = new Map(citations.map((citation) => [citation.label, citation]));
  const parts = content.split(/(\[S-\d{2}\])/g);

  return parts.map((part, index) => {
    const label = part.match(/^\[(S-\d{2})\]$/)?.[1];
    const citation = label ? byLabel.get(label) : undefined;
    if (!citation) return <span key={`${part}-${index}`}>{part}</span>;

    return (
      <button
        key={`${part}-${index}`}
        type="button"
        onClick={() => onSelectCitation(citation)}
        className="mx-1 border-[1.5px] border-ink bg-signal px-1 text-xs text-ink"
      >
        {part}
      </button>
    );
  });
}

export function ChatPanel({
  notebookId,
  initialMessages,
  readySourceCount,
}: {
  notebookId: string;
  initialMessages: ChatMessageItem[];
  readySourceCount: number;
}) {
  const [messages, setMessages] = useState(initialMessages ?? []);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<ChatCitation | null>(
    null
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setError(null);
    setSelectedCitation(null);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Antwort konnte nicht generiert werden.");
        return;
      }
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

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-sm text-ink/60">
            {hasReadySources
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
                        setSelectedCitation
                      )
                    : message.content}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>

      {selectedCitation && (
        <p className="border-[1.5px] border-ink bg-paper px-2 py-1 text-xs">
          {selectedCitation.label}: {selectedCitation.title}
        </p>
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
          disabled={!hasReadySources || busy}
          placeholder={
            hasReadySources
              ? "Frag deine Quellen ..."
              : "Warte auf eine bereite Quelle ..."
          }
          rows={3}
          className="border-[1.5px] border-ink bg-paper px-3 py-2 text-sm disabled:opacity-40"
        />
        <ActionButton disabled={!hasReadySources || busy}>
          {busy ? "Antwort läuft ..." : "Frage stellen"}
        </ActionButton>
      </form>
    </div>
  );
}
