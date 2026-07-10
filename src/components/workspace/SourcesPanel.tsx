"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import type { ChatCitation } from "@/db/repo/chat";
import { SourceForm } from "./SourceForm";

export type SourceListItem = {
  id: string;
  type: "pdf" | "text" | "url" | "youtube" | "audio" | "research";
  status: "pending" | "processing" | "ready" | "error";
  title: string;
  errorMessage: string | null;
  originalUrl: string | null;
  meta?: unknown;
};

export type SourceDetailItem = SourceListItem & {
  content: string | null;
  tokenCount: number | null;
  blobUrl: string | null;
  createdAt: string;
};

type ResearchMeta = { query?: string; citations?: string[] };

function readCitations(meta: unknown): string[] {
  if (
    meta &&
    typeof meta === "object" &&
    "citations" in meta &&
    Array.isArray((meta as ResearchMeta).citations)
  ) {
    return (meta as ResearchMeta).citations as string[];
  }
  return [];
}

const TYPE_LABELS: Record<SourceListItem["type"], string> = {
  pdf: "PDF",
  text: "Text",
  url: "Website",
  youtube: "YouTube",
  audio: "Audio",
  research: "Recherche",
};

const TYPE_ICONS: Record<SourceListItem["type"], IconName> = {
  pdf: "pdf",
  text: "text",
  url: "globe",
  youtube: "video",
  audio: "audio",
  research: "research",
};

const STATUS_LABELS: Record<SourceListItem["status"], string> = {
  pending: "Wartet",
  processing: "Verarbeitung läuft",
  ready: "Bereit",
  error: "Fehler",
};

const STATUS_ICONS: Record<SourceListItem["status"], IconName> = {
  pending: "clock",
  processing: "clock",
  ready: "check",
  error: "alert",
};

function SourceStatus({ status }: { status: SourceListItem["status"] }) {
  const isLoading = status === "pending" || status === "processing";
  return (
    <span className="inline-flex min-h-8 items-center gap-1.5">
      {isLoading ? (
        <span className="grid h-4 w-4 place-items-center">
          <span className="h-4 w-4 animate-spin rounded-full border-[1.5px] border-current/25 border-t-current" />
        </span>
      ) : (
        <Icon name={STATUS_ICONS[status]} size={14} />
      )}
      {STATUS_LABELS[status]}
    </span>
  );
}

export function SourcesPanel({
  notebookId,
  initialSources,
  selectedSourceId = null,
  selectedCitation = null,
  onSelectSource,
  onSourcesChange,
  readOnly = false,
  selectedSourceIds = [],
  onSelectedSourceIdsChange,
}: {
  notebookId: string;
  initialSources: SourceListItem[];
  selectedSourceId?: string | null;
  selectedCitation?: ChatCitation | null;
  onSelectSource?: (sourceId: string | null) => void;
  onSourcesChange?: (sources: SourceListItem[]) => void;
  readOnly?: boolean;
  selectedSourceIds?: string[];
  onSelectedSourceIdsChange?: (ids: string[]) => void;
}) {
  const [sources, setSources] = useState(initialSources);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [viewerState, setViewerState] = useState<{
    sourceId: string;
    source: SourceDetailItem | null;
    error: string | null;
  } | null>(null);

  const [checkedCitations, setCheckedCitations] = useState<Record<string, boolean>>({});
  const [importingCitations, setImportingCitations] = useState<Record<string, boolean>>({});

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    onSourcesChange?.(sources);
  }, [sources, onSourcesChange]);

  useEffect(() => {
    const hasPending = sources.some(
      (s) => s.status === "pending" || s.status === "processing"
    );

    if (!hasPending) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    if (intervalRef.current) return;

    intervalRef.current = setInterval(async () => {
      const res = await fetch(`/api/notebooks/${notebookId}/sources`);
      const json = await res.json();
      setSources(json.sources);
    }, 2000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sources, notebookId]);

  useEffect(() => {
    if (!selectedSourceId) {
      return;
    }

    let cancelled = false;

    fetch(`/api/notebooks/${notebookId}/sources/${selectedSourceId}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error ?? "Quelle konnte nicht geladen werden.");
        }
        if (!cancelled) {
          setViewerState({
            sourceId: selectedSourceId,
            source: json.source,
            error: null,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setViewerState({
            sourceId: selectedSourceId,
            source: null,
            error: "Quelle konnte nicht geladen werden.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [notebookId, selectedSourceId]);

  async function handleRetry(sourceId: string) {
    if (readOnly) return;

    setError(null);
    const res = await fetch(
      `/api/notebooks/${notebookId}/sources/${sourceId}/retry`,
      { method: "POST" }
    );
    if (res.ok) {
      const json = await res.json();
      setSources((prev) =>
        prev.map((s) => (s.id === sourceId ? json.source : s))
      );
    } else {
      setError("Erneut versuchen ist fehlgeschlagen — bitte später nochmal probieren.");
    }
  }

  async function handleDelete(sourceId: string) {
    if (readOnly) return;

    setError(null);
    const res = await fetch(
      `/api/notebooks/${notebookId}/sources/${sourceId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
      if (selectedSourceId === sourceId) {
        onSelectSource?.(null);
      }
    } else {
      setError("Löschen ist fehlgeschlagen — bitte später nochmal probieren.");
    }
  }



  async function handleImportCitation(url: string) {
    if (readOnly || importingCitations[url]) return;

    setImportingCitations((prev) => ({ ...prev, [url]: true }));
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/sources`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "url",
          originalUrl: url,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setSources((prev) => [...prev, json.source]);
      } else {
        setError("Import der Web-Quelle fehlgeschlagen.");
      }
    } catch {
      setError("Keine Verbindung zum Importieren.");
    } finally {
      setImportingCitations((prev) => ({ ...prev, [url]: false }));
    }
  }

  async function handleImportSelectedCitations(urls: string[]) {
    if (readOnly) return;
    setError(null);
    for (const url of urls) {
      const isAlreadyAdded = sources.some((s) => s.originalUrl === url);
      if (isAlreadyAdded) continue;

      setImportingCitations((prev) => ({ ...prev, [url]: true }));
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/sources`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "url",
            originalUrl: url,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          setSources((prev) => [...prev, json.source]);
        }
      } catch {
        // continue
      } finally {
        setImportingCitations((prev) => ({ ...prev, [url]: false }));
      }
    }
    setCheckedCitations({});
  }

  const currentViewer =
    selectedSourceId && viewerState?.sourceId === selectedSourceId
      ? viewerState
      : null;
  const selectedSource = currentViewer?.source ?? null;
  const viewerError = currentViewer?.error ?? null;
  const viewerBusy = Boolean(selectedSourceId && !currentViewer);
  const activeCitation =
    selectedSource &&
    selectedCitation?.sourceId === selectedSource.id &&
    typeof selectedCitation.start === "number" &&
    typeof selectedCitation.end === "number"
      ? selectedCitation
      : null;

  function renderSourceContent(source: SourceDetailItem) {
    const content = source.content ?? "";
    if (!content.trim()) {
      return "Für diese Quelle ist noch kein Text verfügbar.";
    }

    if (!activeCitation) return content;

    const start = Math.max(0, Math.min(activeCitation.start ?? 0, content.length));
    const end = Math.max(start, Math.min(activeCitation.end ?? start, content.length));
    if (end <= start) return content;

    return (
      <>
        {content.slice(0, start)}
        <mark className="bg-signal px-0.5 text-ink">
          {content.slice(start, end)}
        </mark>
        {content.slice(end)}
      </>
    );
  }

  const readySources = sources.filter((s) => s.status === "ready");
  const allSelected =
    readySources.length > 0 && readySources.every((s) => selectedSourceIds.includes(s.id));

  return (
    <div className="flex h-full flex-col gap-4">
      {readOnly ? (
        <p className="ki-soft px-4 py-3 text-sm text-muted">
          Demo-Notebook ist schreibgeschützt.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="ki-pill ki-interactive flex w-full cursor-pointer items-center justify-center gap-2 p-3 text-sm font-semibold text-ink"
        >
          <Icon name="plus" size={16} />
          Quellen hinzufügen
        </button>
      )}



      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Quellen hinzufügen"
        >
          <SourceForm
            notebookId={notebookId}
            onCreated={(source) => {
              setSources((prev) => [...prev, source]);
              setIsModalOpen(false);
            }}
          />
        </Modal>
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

      {selectedSourceId && (
        <section className="ki-raised p-4 text-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="label-caps text-muted">Quellen-Viewer</p>
            <button
              type="button"
              onClick={() => onSelectSource?.(null)}
              className="ki-pill ki-interactive inline-flex min-h-10 items-center gap-1.5 px-3 py-1 text-xs"
            >
              <Icon name="x" size={14} />
              Schließen
            </button>
          </div>

          {viewerBusy && (
            <p className="mt-3 inline-flex items-center gap-2 text-xs text-muted">
              <span className="h-4 w-4 animate-spin rounded-full border-[1.5px] border-current/25 border-t-current" />
              Quelle wird geladen
            </p>
          )}

          {viewerError && (
            <p
              className="mt-3 flex items-center gap-2 rounded-sm border border-line bg-paper px-3 py-2 text-xs text-danger"
              role="alert"
            >
              <Icon name="alert" size={14} className="shrink-0" />
              {viewerError}
            </p>
          )}

          {selectedSource && (
            <div className="mt-3 flex flex-col gap-3">
              <div>
                <p className="font-bold">{selectedSource.title}</p>
                <p className="label-caps mt-1 text-muted">
                  {TYPE_LABELS[selectedSource.type]}
                  {selectedSource.tokenCount
                    ? ` / ${selectedSource.tokenCount.toLocaleString(
                        "de-DE"
                      )} Tokens`
                    : ""}
                </p>
                {selectedSource.originalUrl && (
                  <a
                    href={selectedSource.originalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block truncate text-xs text-ink/80 underline"
                  >
                    {selectedSource.originalUrl}
                  </a>
                )}
              </div>
              <div className="ki-soft max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md p-4 font-sans text-xs leading-5 text-ink/90">
                {renderSourceContent(selectedSource)}
              </div>

              {/* Research Citations Import Section */}
              {selectedSource.type === "research" &&
                (() => {
                  const citations = readCitations(selectedSource.meta);
                  if (citations.length === 0) return null;
                  const importable = citations.filter(
                    (url) => !sources.some((s) => s.originalUrl === url)
                  );
                  if (importable.length === 0) return null;
                  const anyChecked = importable.some((url) => checkedCitations[url]);
                  return (
                    <div className="mt-4 flex flex-col gap-3 border-t border-line/50 pt-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="label-caps text-ink/85">Gefundene Web-Quellen</p>
                        <button
                          type="button"
                          disabled={!anyChecked}
                          onClick={() => {
                            const urlsToImport = importable.filter((url) => checkedCitations[url]);
                            handleImportSelectedCitations(urlsToImport);
                          }}
                          className="ki-pill ki-interactive cursor-pointer px-2.5 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Ausgewählte hinzufügen
                        </button>
                      </div>
                      <div className="flex max-h-60 flex-col gap-2 overflow-y-auto pr-1">
                        {citations.map((url, idx) => {
                        const isAdded = sources.some((s) => s.originalUrl === url);
                        const isImporting = importingCitations[url];
                        const isChecked = checkedCitations[url] ?? false;

                        return (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-3 rounded-sm border border-line bg-paper px-2.5 py-2"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-2.5">
                              {!isAdded && (
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) =>
                                    setCheckedCitations((prev) => ({
                                      ...prev,
                                      [url]: e.target.checked,
                                    }))
                                  }
                                  className="h-4 w-4 shrink-0 cursor-pointer"
                                />
                              )}
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="truncate text-xs text-ink/90 underline underline-offset-2 hover:text-ink"
                              >
                                {url}
                              </a>
                            </div>
                            {isAdded ? (
                              <span className="label-caps inline-flex shrink-0 items-center gap-1 rounded-full bg-panel-soft px-2 py-1 text-muted">
                                <Icon name="check" size={11} />
                                Hinzugefügt
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={isImporting}
                                onClick={() => handleImportCitation(url)}
                                className="ki-pill ki-interactive label-caps shrink-0 cursor-pointer px-2.5 py-1 text-ink"
                              >
                                {isImporting ? "Lädt …" : "Importieren"}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </section>
      )}

      {readySources.length > 0 && (
        <label className="flex cursor-pointer items-center justify-end gap-2 border-b border-line/50 px-1 pb-2.5 pt-1">
          <span className="label-caps text-muted">Alle auswählen</span>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => {
              if (e.target.checked) {
                onSelectedSourceIdsChange?.(readySources.map((s) => s.id));
              } else {
                onSelectedSourceIdsChange?.([]);
              }
            }}
            className="h-4 w-4 cursor-pointer"
          />
        </label>
      )}

      <ul className="flex flex-col gap-2 overflow-y-auto">
        {sources.length === 0 && (
          <li className="ki-raised px-4 py-5 text-sm leading-6 text-muted">
            Noch keine Quellen. PDF, Website, YouTube, Audio oder Recherche
            hinzufügen.
          </li>
        )}
        {sources.map((s) => (
          <li
            key={s.id}
            className={`ki-interactive rounded-md border-[1.5px] p-3 text-sm ${
              selectedSourceId === s.id
                ? "border-2 border-signal bg-signal/15 shadow-glow"
                : "border-line bg-paper hover:bg-panel-soft"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onSelectSource?.(s.id)}
                className="inline-flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 text-left font-semibold underline-offset-2 hover:underline"
              >
                <span className="ki-tile h-10 w-10 shrink-0">
                  <Icon name={TYPE_ICONS[s.type]} size={16} />
                </span>
                <span className="truncate">{s.title}</span>
              </button>
              {s.status === "ready" && (
                <input
                  type="checkbox"
                  checked={selectedSourceIds.includes(s.id)}
                  onChange={() => {
                    if (selectedSourceIds.includes(s.id)) {
                      onSelectedSourceIdsChange?.(
                        selectedSourceIds.filter((id) => id !== s.id)
                      );
                    } else {
                      onSelectedSourceIdsChange?.([...selectedSourceIds, s.id]);
                    }
                  }}
                  className="h-4 w-4 cursor-pointer"
                />
              )}
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-3 text-xs text-muted">
              <span className="inline-flex min-h-8 items-center gap-1.5">
                <SourceStatus status={s.status} />
              </span>
              {!readOnly && (
                <div className="flex flex-wrap justify-end gap-2">
                  {s.status === "error" && (
                    <button
                      onClick={() => handleRetry(s.id)}
                      className="ki-pill ki-interactive inline-flex min-h-8 cursor-pointer items-center gap-1 px-2.5 text-ink/80"
                    >
                      <Icon name="retry" size={13} />
                      Erneut versuchen
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="ki-pill ki-interactive inline-flex min-h-8 cursor-pointer items-center gap-1 px-2.5 text-ink/80 hover:border-danger hover:text-danger"
                  >
                    <Icon name="trash" size={13} />
                    Löschen
                  </button>
                </div>
              )}
            </div>
            {s.status === "error" && s.errorMessage && (
              <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-danger">
                <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
                {s.errorMessage}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
