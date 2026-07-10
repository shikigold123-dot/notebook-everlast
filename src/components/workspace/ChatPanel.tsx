"use client";

import {
  FormEvent,
  KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ActionButton } from "@/components/ui/ActionButton";
import { Icon } from "@/components/ui/Icon";
import type { ChatCitation } from "@/db/repo/chat";
import {
  DEFAULT_CHAT_MODEL,
  FALLBACK_CHAT_MODELS,
  normalizeOpenRouterModelId,
  type OpenRouterChatModelOption,
} from "@/lib/openrouter/chat-models";

export type ChatMessageItem = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: ChatCitation[] | null;
};

type StreamMessage = ChatMessageItem;

function readInitialModelState() {
  const saved =
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem("everlast_chat_model");
  const normalized = normalizeOpenRouterModelId(saved);
  if (!normalized) {
    return DEFAULT_CHAT_MODEL;
  }
  if (FALLBACK_CHAT_MODELS.some((model) => model.id === normalized)) {
    return normalized;
  }
  return DEFAULT_CHAT_MODEL;
}

function systemMessageStorageKey(notebookId: string) {
  return `everlast_chat_system_message:${notebookId}`;
}

function readInitialSystemMessage(notebookId: string) {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(systemMessageStorageKey(notebookId)) ?? "";
}

function renderInlineMarkdown(
  content: string,
  citations: ChatCitation[] | null,
  onSelectCitation: (citation: ChatCitation) => void,
  keyPrefix: string
): ReactNode[] {
  const byMarker = new Map(
    (citations ?? []).map((citation) => [
      citation.marker ?? `[${citation.label}]`,
      citation,
    ])
  );
  const parts = content.split(
    /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_|\[[^\]\n]+\]\([^\s)]+\)|\[S-\d{2}(?:#\d+-\d+)?\])/g
  );

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    const citation = byMarker.get(part);
    if (citation) {
      return (
        <button
          key={key}
          type="button"
          onClick={() => onSelectCitation(citation)}
          className="ki-cta mx-1 inline-flex cursor-pointer rounded-full border border-signal px-2 py-0.5 align-baseline text-xs font-semibold"
        >
          [{citation.label}]
        </button>
      );
    }

    if (
      (part.startsWith("**") && part.endsWith("**")) ||
      (part.startsWith("__") && part.endsWith("__"))
    ) {
      return (
        <strong key={key} className="font-bold text-ink">
          {renderInlineMarkdown(part.slice(2, -2), citations, onSelectCitation, key)}
        </strong>
      );
    }

    if (
      (part.startsWith("*") && part.endsWith("*")) ||
      (part.startsWith("_") && part.endsWith("_"))
    ) {
      return (
        <em key={key}>
          {renderInlineMarkdown(part.slice(1, -1), citations, onSelectCitation, key)}
        </em>
      );
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={key}
          className="rounded-[4px] border border-line bg-panel-soft px-1 font-mono text-[0.85em]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) {
      return (
        <a
          key={key}
          href={link[2]}
          target="_blank"
          rel="noreferrer"
          className="font-semibold underline decoration-signal decoration-2 underline-offset-2"
        >
          {link[1]}
        </a>
      );
    }

    return <span key={key}>{part}</span>;
  });
}

function isMarkdownBlockStart(line: string) {
  return /^(#{1,3}\s+|>\s?|[-*+]\s+|\d+[.)]\s+|```)/.test(line);
}

function renderAssistantMarkdown(
  content: string,
  citations: ChatCitation[] | null,
  onSelectCitation: (citation: ChatCitation) => void
) {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let lineIndex = 0;
  let blockIndex = 0;
  const inline = (value: string, key: string) =>
    renderInlineMarkdown(value, citations, onSelectCitation, key);

  while (lineIndex < lines.length) {
    const line = lines[lineIndex];
    if (!line.trim()) {
      lineIndex += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      lineIndex += 1;
      while (lineIndex < lines.length && !lines[lineIndex].startsWith("```")) {
        codeLines.push(lines[lineIndex]);
        lineIndex += 1;
      }
      if (lineIndex < lines.length) lineIndex += 1;
      blocks.push(
        <pre
          key={`block-${blockIndex++}`}
          className="my-3 overflow-x-auto rounded-sm border border-line bg-panel-soft/50 p-3 font-mono text-xs leading-6"
        >
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const Heading = heading[1].length === 1 ? "h3" : heading[1].length === 2 ? "h4" : "h5";
      blocks.push(
        <Heading key={`block-${blockIndex++}`} className="mt-4 mb-2 text-base font-bold leading-6 first:mt-0">
          {inline(heading[2], `heading-${lineIndex}`)}
        </Heading>
      );
      lineIndex += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (lineIndex < lines.length && /^>\s?/.test(lines[lineIndex])) {
        quoteLines.push(lines[lineIndex].replace(/^>\s?/, ""));
        lineIndex += 1;
      }
      blocks.push(
        <blockquote key={`block-${blockIndex++}`} className="my-3 rounded-sm bg-panel-soft/70 px-3.5 py-2.5 italic text-muted">
          {quoteLines.map((quote, index) => (
            <span key={index}>
              {inline(quote, `quote-${lineIndex}-${index}`)}
              {index < quoteLines.length - 1 && <br />}
            </span>
          ))}
        </blockquote>
      );
      continue;
    }

    const listMatch = line.match(/^[-*+]\s+(.+)$/);
    const orderedMatch = line.match(/^\d+[.)]\s+(.+)$/);
    if (listMatch || orderedMatch) {
      const ordered = Boolean(orderedMatch);
      const items: string[] = [];
      const matcher = ordered ? /^\d+[.)]\s+(.+)$/ : /^[-*+]\s+(.+)$/;
      while (lineIndex < lines.length) {
        const match = lines[lineIndex].match(matcher);
        if (!match) break;
        items.push(match[1]);
        lineIndex += 1;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={`block-${blockIndex++}`} className={`my-3 space-y-1.5 pl-5 ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((item, index) => (
            <li key={index} className="pl-1">
              {inline(item, `list-${lineIndex}-${index}`)}
            </li>
          ))}
        </List>
      );
      continue;
    }

    const paragraph: string[] = [];
    while (
      lineIndex < lines.length &&
      lines[lineIndex].trim() &&
      !isMarkdownBlockStart(lines[lineIndex])
    ) {
      paragraph.push(lines[lineIndex]);
      lineIndex += 1;
    }
    blocks.push(
      <p key={`block-${blockIndex++}`} className="my-0 leading-7">
        {paragraph.map((paragraphLine, index) => (
          <span key={index}>
            {inline(paragraphLine, `paragraph-${lineIndex}-${index}`)}
            {index < paragraph.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
  }

  return blocks;
}

export function ChatPanel({
  notebookId,
  initialMessages,
  readySourceCount,
  onSelectSource,
  readOnly = false,
  selectedSourceIds,
  selectedNoteIds,
}: {
  notebookId: string;
  initialMessages: ChatMessageItem[];
  readySourceCount: number;
  onSelectSource?: (sourceId: string, citation?: ChatCitation) => void;
  readOnly?: boolean;
  selectedSourceIds?: string[];
  selectedNoteIds?: string[];
}) {
  const [messages, setMessages] = useState(initialMessages ?? []);
  const [question, setQuestion] = useState("");
  const [modelOptions, setModelOptions] =
    useState<OpenRouterChatModelOption[]>(FALLBACK_CHAT_MODELS);
  const [selectedModel, setSelectedModel] = useState(() =>
    readInitialModelState()
  );
  const [systemMessage, setSystemMessage] = useState(() =>
    readInitialSystemMessage(notebookId)
  );
  const [isSystemMessageOpen, setIsSystemMessageOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<ChatCitation | null>(
    null
  );
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    if (!isDropdownOpen) return;
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest(".model-select-container")) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [isDropdownOpen]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/openrouter/models")
      .then((res) => res.json())
      .then((json) => {
        if (cancelled || !Array.isArray(json.models)) return;
        const models = json.models
          .filter(
            (model: unknown): model is OpenRouterChatModelOption =>
              Boolean(
                model &&
                  typeof model === "object" &&
                  typeof (model as OpenRouterChatModelOption).id === "string" &&
                  typeof (model as OpenRouterChatModelOption).name === "string"
              )
          )
          .slice(0, 200);
        if (models.length > 0) setModelOptions(models);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = systemMessageStorageKey(notebookId);
    if (systemMessage.trim()) {
      window.localStorage.setItem(key, systemMessage);
    } else {
      window.localStorage.removeItem(key);
    }
  }, [notebookId, systemMessage]);

  const effectiveModel = useMemo(() => {
    return normalizeOpenRouterModelId(selectedModel) ?? DEFAULT_CHAT_MODEL;
  }, [selectedModel]);

  function persistModel(model: string) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("everlast_chat_model", model);
    }
  }

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
        body: JSON.stringify({
          question: trimmed,
          ...(selectedSourceIds !== undefined ? { sourceIds: selectedSourceIds } : {}),
          ...(selectedNoteIds !== undefined ? { noteIds: selectedNoteIds } : {}),
          ...(systemMessage.trim() ? { systemMessage: systemMessage.trim() } : {}),
          model: effectiveModel,
        }),
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

  async function handleClearChat() {
    if (readOnly || busy) return;
    if (!confirm("Möchtest du den Chat wirklich leeren?")) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/chat`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Chat konnte nicht geleert werden.");
        return;
      }
      setMessages([]);
      setSelectedCitation(null);
    } catch {
      setError("Keine Verbindung — bitte nochmal versuchen.");
    } finally {
      setBusy(false);
    }
  }

  function handleQuestionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  const hasReadySources = readySourceCount > 0 || (selectedNoteIds?.length ?? 0) > 0;
  const canAsk = hasReadySources && !readOnly;

  function handleSelectCitation(citation: ChatCitation) {
    setSelectedCitation(citation);
    onSelectSource?.(citation.sourceId, citation);
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="min-h-80 flex-1 overflow-y-auto pr-1 lg:min-h-0">
        {messages.length === 0 ? (
          <div className="grid h-full place-items-center">
            <div className="ki-raised max-w-md p-7 text-center">
              <span className="ki-tile mx-auto h-12 w-12">
                <Icon name="chat" size={20} />
              </span>
              <p className="mt-4 text-xl font-semibold tracking-tight">
                Frag dein Notebook
              </p>
              <p className="mt-2 text-sm leading-6 text-muted">
                {readOnly
                  ? "Demo-Notebook ist schreibgeschützt."
                  : hasReadySources
                    ? "Stell eine Frage, vergleiche Quellen oder lass dir Widersprüche markieren."
                    : "Wähle zuerst eine bereite Quelle oder Notiz aus."}
              </p>
            </div>
          </div>
        ) : (
          <ol className="flex flex-col gap-4">
            {messages.map((message) => (
              <li
                key={message.id}
                className={`ki-enter text-sm ${
                  message.role === "user"
                    ? "ml-auto max-w-[85%] rounded-md rounded-br-sm border-[1.5px] border-line bg-panel-soft p-4 text-ink"
                    : "text-ink"
                }`}
              >
                {message.role === "user" ? (
                  <p className="label-caps mb-2 text-muted">Du</p>
                ) : (
                  <p className="mb-2 flex items-center gap-2">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-signal text-signal-ink">
                      <Icon name="spark" size={11} />
                    </span>
                    <span className="label-caps text-muted">Everlast</span>
                  </p>
                )}
                <div
                  className={`text-[0.95rem] leading-7 ${
                    message.role === "user" ? "whitespace-pre-wrap" : ""
                  }`}
                >
                  {message.role === "assistant"
                    ? renderAssistantMarkdown(
                        message.content,
                        message.citations,
                        handleSelectCitation
                      )
                    : message.content}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {selectedCitation && (
        <div className="ki-enter rounded-sm border-[1.5px] border-line bg-paper px-4 py-3 text-xs">
          <p className="font-semibold">
            {selectedCitation.label}: {selectedCitation.title}
          </p>
          {selectedCitation.citedText && (
            <p className="mt-1.5 max-h-12 overflow-hidden leading-5 text-muted">
              {selectedCitation.citedText}
            </p>
          )}
        </div>
      )}

      {error && (
        <p
          className="flex items-center gap-2.5 rounded-sm border-[1.5px] border-line bg-paper px-4 py-3 text-sm text-danger"
          role="alert"
        >
          <Icon name="alert" size={16} className="shrink-0" />
          {error}
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-md border-[1.5px] border-line bg-paper p-2 shadow-card transition-colors focus-within:border-signal/70"
      >
        <div className="mb-2 flex gap-2">
          <div className="model-select-container relative flex-1">
            <div className="relative flex min-h-11 items-center gap-2 rounded-[0.75rem] border border-line bg-panel/60 px-3 text-xs">
              <span className="label-caps shrink-0 text-ink/60">Modell</span>
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                disabled={!canAsk || busy}
                aria-label="Modell auswählen"
                aria-expanded={isDropdownOpen}
                className="flex flex-1 cursor-pointer items-center justify-between bg-transparent py-1 pr-1 text-left text-sm font-semibold text-ink outline-none disabled:cursor-not-allowed disabled:opacity-45"
              >
                <span className="truncate">
                  {modelOptions.find((m) => m.id === effectiveModel)?.name ??
                    effectiveModel}
                </span>
                <Icon
                  name="chevronRight"
                  size={14}
                  className={`shrink-0 transition-transform duration-200 ${
                    isDropdownOpen ? "-rotate-90" : "rotate-90"
                  }`}
                />
              </button>

              {isDropdownOpen && (
                <ul className="ki-menu ki-enter absolute inset-x-0 bottom-[calc(100%+6px)] z-50 max-h-60 overflow-y-auto py-1">
                  {modelOptions.map((model) => {
                    const isActive = model.id === effectiveModel;
                    return (
                      <li key={model.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedModel(model.id);
                            persistModel(model.id);
                            setIsDropdownOpen(false);
                          }}
                          className={`flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-left text-xs transition-colors ${
                            isActive
                              ? "bg-signal font-bold text-signal-ink"
                              : "font-medium text-ink hover:bg-panel-soft"
                          }`}
                        >
                          <span className="truncate">{model.name}</span>
                          {isActive && (
                            <Icon name="check" size={13} className="shrink-0" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsSystemMessageOpen((open) => !open)}
            disabled={readOnly || busy}
            aria-expanded={isSystemMessageOpen}
            aria-controls="chat-system-message"
            aria-label="Systemanweisung bearbeiten"
            title="Systemanweisung bearbeiten"
            className={`ki-tile h-11 w-11 shrink-0 cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
              systemMessage.trim()
                ? "border-signal bg-signal text-signal-ink"
                : "hover:bg-panel-soft"
            }`}
          >
            <Icon name="text" size={17} />
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClearChat}
              disabled={busy || readOnly}
              aria-label="Chat leeren"
              title="Chat leeren"
              className="ki-tile h-11 w-11 shrink-0 cursor-pointer transition-colors hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Icon name="trash" size={17} />
            </button>
          )}
        </div>

        {isSystemMessageOpen && (
          <div
            id="chat-system-message"
            className="ki-enter mb-2 rounded-[0.75rem] border border-line bg-panel-soft/60 p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <label
                htmlFor="chat-system-message-input"
                className="label-caps text-ink"
              >
                Systemanweisung
              </label>
              {systemMessage.trim() && (
                <button
                  type="button"
                  onClick={() => setSystemMessage("")}
                  disabled={readOnly || busy}
                  className="label-caps cursor-pointer border-b border-ink text-ink disabled:opacity-45"
                >
                  Zurücksetzen
                </button>
              )}
            </div>
            <textarea
              id="chat-system-message-input"
              value={systemMessage}
              onChange={(event) => setSystemMessage(event.target.value)}
              disabled={readOnly || busy}
              maxLength={4000}
              rows={3}
              placeholder="Zum Beispiel: Antworte besonders knapp und erkläre Fachbegriffe in einfacher Sprache."
              className="w-full resize-y rounded-sm border border-line bg-paper px-3 py-2 text-sm leading-6 outline-none transition-colors focus:border-signal disabled:opacity-45"
            />
            <p className="mt-2 text-xs leading-5 text-muted">
              Gilt für alle folgenden Antworten dieses Notebooks. Quellen und
              Belege bleiben verpflichtend.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={handleQuestionKeyDown}
            disabled={!canAsk || busy}
            placeholder={
              readOnly
                ? "Demo-Notebook ist schreibgeschützt."
                : hasReadySources
                ? "Frag deinen ausgewählten Kontext …"
                : "Wähle eine Quelle oder Notiz aus …"
            }
            rows={2}
            className="min-h-16 flex-1 resize-none bg-transparent px-4 py-3 text-sm leading-6 outline-none disabled:opacity-45"
          />
          <ActionButton disabled={!canAsk || busy} className="w-full shrink-0 sm:w-auto">
            <Icon name="send" size={16} />
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/25 border-t-current" />
                Antwort läuft
              </span>
            ) : (
              "Frage stellen"
            )}
          </ActionButton>
        </div>
      </form>
    </div>
  );
}
