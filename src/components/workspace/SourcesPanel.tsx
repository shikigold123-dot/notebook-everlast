"use client";

import { useEffect, useRef, useState } from "react";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { SourceForm } from "./SourceForm";

export type SourceListItem = {
  id: string;
  type: "pdf" | "text" | "url" | "youtube" | "audio";
  status: "pending" | "processing" | "ready" | "error";
  title: string;
  errorMessage: string | null;
};

export type SourceDetailItem = SourceListItem & {
  content: string | null;
  tokenCount: number | null;
  originalUrl: string | null;
  blobUrl: string | null;
  createdAt: string;
};

const TYPE_LABELS: Record<SourceListItem["type"], string> = {
  pdf: "PDF",
  text: "Text",
  url: "Website",
  youtube: "YouTube",
  audio: "Audio",
};

const STATUS_LABELS: Record<SourceListItem["status"], string> = {
  pending: "⏳ Warten …",
  processing: "⏳ Verarbeitung …",
  ready: "✓ Bereit",
  error: "⚠ Fehler",
};

export function SourcesPanel({
  notebookId,
  initialSources,
  selectedSourceId = null,
  onSelectSource,
  onSourcesChange,
  readOnly = false,
}: {
  notebookId: string;
  initialSources: SourceListItem[];
  selectedSourceId?: string | null;
  onSelectSource?: (sourceId: string | null) => void;
  onSourcesChange?: (sources: SourceListItem[]) => void;
  readOnly?: boolean;
}) {
  const [sources, setSources] = useState(initialSources);
  const [error, setError] = useState<string | null>(null);
  const [viewerState, setViewerState] = useState<{
    sourceId: string;
    source: SourceDetailItem | null;
    error: string | null;
  } | null>(null);
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

  const currentViewer =
    selectedSourceId && viewerState?.sourceId === selectedSourceId
      ? viewerState
      : null;
  const selectedSource = currentViewer?.source ?? null;
  const viewerError = currentViewer?.error ?? null;
  const viewerBusy = Boolean(selectedSourceId && !currentViewer);

  return (
    <div className="flex h-full flex-col gap-3">
      {readOnly ? (
        <p className="border-b-[1.5px] border-ink pb-3 text-sm text-ink/60">
          Demo-Dossier ist schreibgeschützt.
        </p>
      ) : (
        <SourceForm
          notebookId={notebookId}
          onCreated={(source) => setSources((prev) => [...prev, source])}
        />
      )}

      {error && (
        <p className="border-[1.5px] border-ink bg-paper px-2 py-1 text-sm">
          {error}
        </p>
      )}

      {selectedSourceId && (
        <section className="border-[1.5px] border-ink bg-paper p-2 text-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="label-caps">Quellen-Viewer</p>
            <button
              type="button"
              onClick={() => onSelectSource?.(null)}
              className="text-xs underline"
            >
              Schließen
            </button>
          </div>

          {viewerBusy && (
            <p className="mt-2 text-xs text-ink/60">Quelle wird geladen ...</p>
          )}

          {viewerError && (
            <p className="mt-2 border-[1.5px] border-ink bg-paper px-2 py-1 text-xs">
              {viewerError}
            </p>
          )}

          {selectedSource && (
            <div className="mt-2 flex flex-col gap-2">
              <div>
                <p className="font-bold">{selectedSource.title}</p>
                <p className="label-caps mt-1 text-ink/60">
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
                    className="mt-1 block truncate text-xs underline"
                  >
                    {selectedSource.originalUrl}
                  </a>
                )}
              </div>
              <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap border-t-[1.5px] border-ink pt-2 font-sans text-xs leading-5">
                {selectedSource.content?.trim() ||
                  "Für diese Quelle ist noch kein Text verfügbar."}
              </pre>
            </div>
          )}
        </section>
      )}

      <ul className="flex flex-col gap-2 overflow-y-auto">
        {sources.length === 0 && (
          <li className="text-sm text-ink/60">
            Noch keine Quellen. PDF, Website, YouTube oder Audio hinzufügen.
          </li>
        )}
        {sources.map((s) => (
          <li
            key={s.id}
            className={`border-[1.5px] border-ink p-2 text-sm ${
              selectedSourceId === s.id ? "bg-signal" : "bg-paper"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onSelectSource?.(s.id)}
                className="truncate text-left underline-offset-2 hover:underline"
              >
                {s.title}
              </button>
              <SectionLabel>{TYPE_LABELS[s.type]}</SectionLabel>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-ink/60">
              <span>{STATUS_LABELS[s.status]}</span>
              {!readOnly && (
                <div className="flex gap-2">
                  {s.status === "error" && (
                    <button
                      onClick={() => handleRetry(s.id)}
                      className="underline"
                    >
                      Erneut versuchen
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="underline"
                  >
                    Löschen
                  </button>
                </div>
              )}
            </div>
            {s.status === "error" && s.errorMessage && (
              <p className="mt-1 text-xs text-ink/60">{s.errorMessage}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
