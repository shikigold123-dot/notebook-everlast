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
}: {
  notebookId: string;
  initialSources: SourceListItem[];
}) {
  const [sources, setSources] = useState(initialSources);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  async function handleRetry(sourceId: string) {
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
    setError(null);
    const res = await fetch(
      `/api/notebooks/${notebookId}/sources/${sourceId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
    } else {
      setError("Löschen ist fehlgeschlagen — bitte später nochmal probieren.");
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <SourceForm
        notebookId={notebookId}
        onCreated={(source) => setSources((prev) => [...prev, source])}
      />

      {error && (
        <p className="border-[1.5px] border-ink bg-paper px-2 py-1 text-sm">
          {error}
        </p>
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
            className="border-[1.5px] border-ink bg-paper p-2 text-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">{s.title}</span>
              <SectionLabel>{TYPE_LABELS[s.type]}</SectionLabel>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-ink/60">
              <span>{STATUS_LABELS[s.status]}</span>
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
