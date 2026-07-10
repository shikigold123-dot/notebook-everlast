"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { ActionButton } from "@/components/ui/ActionButton";
import { Icon } from "@/components/ui/Icon";
import { UPLOAD_MAX_SIZES } from "@/lib/ingestion/upload-limits";
import type { SourceListItem } from "./SourcesPanel";

const SIZE_ERROR: Record<"pdf" | "audio", string> = {
  pdf: "PDF-Dateien dürfen höchstens 15 MB groß sein.",
  audio: "Audio-Dateien dürfen höchstens 25 MB groß sein.",
};

const TYPE_DETAILS = [
  { value: "pdf", label: "PDF-Dokument", description: "Lade ein PDF hoch (max. 15 MB)", icon: "pdf" },
  { value: "audio", label: "Audio-Datei", description: "Lade Audio hoch (max. 25 MB)", icon: "audio" },
  { value: "text", label: "Text einfügen", description: "Füge Text manuell ein", icon: "text" },
  { value: "url", label: "Website", description: "Importiere eine Website per Link", icon: "globe" },
  { value: "youtube", label: "YouTube-Video", description: "Transkribiere ein Video per Link", icon: "video" },
  { value: "research", label: "Deep Research", description: "Führe eine Web-Recherche durch", icon: "research" },
] as const;

export function SourceForm({
  notebookId,
  onCreated,
}: {
  notebookId: string;
  onCreated: (source: SourceListItem) => void;
}) {
  const [selectedType, setSelectedType] = useState<SourceListItem["type"] | null>(null);
  const [textValue, setTextValue] = useState("");
  const [urlValue, setUrlValue] = useState("");
  const [researchValue, setResearchValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitSource(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/sources`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(
          json.error ?? "Das hat nicht geklappt — bitte nochmal versuchen."
        );
        return;
      }
      const json = await res.json();
      onCreated(json.source);
    } catch {
      setError("Keine Verbindung — bitte nochmal versuchen.");
    } finally {
      setBusy(false);
    }
  }

  async function handleTextSubmit() {
    if (!textValue.trim()) return;
    await submitSource({ type: "text", content: textValue });
    setTextValue("");
  }

  async function handleUrlSubmit() {
    if (!urlValue.trim() || !selectedType) return;
    await submitSource({ type: selectedType, originalUrl: urlValue });
    setUrlValue("");
  }

  async function handleResearchSubmit() {
    if (!researchValue.trim()) return;
    await submitSource({ type: "research", query: researchValue });
    setResearchValue("");
  }

  async function handleFileSelect(file: File, fileType: "pdf" | "audio") {
    if (file.size > UPLOAD_MAX_SIZES[fileType]) {
      setError(SIZE_ERROR[fileType]);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let blob: { url: string };
      try {
        blob = await upload(file.name, file, {
          access: "public",
          handleUploadUrl: `/api/notebooks/${notebookId}/blob-upload-token`,
          clientPayload: JSON.stringify({ type: fileType }),
        });
      } catch {
        const form = new FormData();
        form.set("type", fileType);
        form.set("file", file);
        const fallbackRes = await fetch(
          `/api/notebooks/${notebookId}/local-upload`,
          {
            method: "POST",
            body: form,
          }
        );
        const fallbackJson = await fallbackRes.json().catch(() => ({}));
        if (!fallbackRes.ok || typeof fallbackJson.url !== "string") {
          throw new Error(
            fallbackJson.error ??
              "Der lokale Upload ist fehlgeschlagen — bitte nochmal versuchen."
          );
        }
        blob = { url: fallbackJson.url };
      }
      await submitSource({
        type: fileType,
        title: file.name,
        blobUrl: blob.url,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Der Upload ist fehlgeschlagen — bitte nochmal versuchen."
      );
      setBusy(false);
    }
  }

  if (!selectedType) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TYPE_DETAILS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setSelectedType(opt.value)}
            className="ki-raised ki-interactive group flex cursor-pointer flex-col items-center justify-center gap-3 p-5 text-center"
          >
            <span className="ki-tile h-12 w-12 transition-colors duration-200 group-hover:border-signal group-hover:bg-signal group-hover:text-signal-ink">
              <Icon name={opt.icon} size={21} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">
                {opt.label}
              </span>
              <span className="mt-1.5 block text-xs leading-4 text-muted">
                {opt.description}
              </span>
            </span>
          </button>
        ))}
      </div>
    );
  }

  const activeOpt = TYPE_DETAILS.find((o) => o.value === selectedType)!;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            setSelectedType(null);
            setError(null);
          }}
          className="ki-pill ki-interactive inline-flex min-h-9 cursor-pointer items-center gap-1.5 px-3 py-1 text-xs font-semibold text-ink"
        >
          <Icon name="chevronRight" size={13} className="rotate-180" />
          Zurück
        </button>
        <span className="label-caps inline-flex items-center gap-1.5 text-muted">
          <Icon name={activeOpt.icon} size={13} />
          {activeOpt.label}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {selectedType === "text" && (
          <>
            <textarea
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              placeholder="Text hier einfügen …"
              disabled={busy}
              className="ki-soft min-h-40 rounded-md px-4 py-3 text-sm leading-6 outline-none transition-colors focus:border-signal"
              rows={5}
            />
            <ActionButton onClick={handleTextSubmit} disabled={busy} loading={busy}>
              Hinzufügen
            </ActionButton>
          </>
        )}

        {(selectedType === "url" || selectedType === "youtube") && (
          <>
            <input
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              placeholder={selectedType === "youtube" ? "YouTube-Video URL …" : "Website URL …"}
              disabled={busy}
              className="ki-soft min-h-11 rounded-md px-4 py-3 text-sm outline-none transition-colors focus:border-signal"
            />
            <ActionButton onClick={handleUrlSubmit} disabled={busy} loading={busy}>
              Hinzufügen
            </ActionButton>
          </>
        )}

        {selectedType === "research" && (
          <>
            <textarea
              value={researchValue}
              onChange={(e) => setResearchValue(e.target.value)}
              placeholder="Was möchtest du recherchieren?"
              disabled={busy}
              className="ki-soft min-h-36 rounded-md px-4 py-3 text-sm leading-6 outline-none transition-colors focus:border-signal"
              rows={4}
            />
            <ActionButton onClick={handleResearchSubmit} disabled={busy} loading={busy}>
              Recherchieren
            </ActionButton>
          </>
        )}

        {(selectedType === "pdf" || selectedType === "audio") && (
          <div className="flex flex-col gap-3">
            <input
              type="file"
              accept={selectedType === "pdf" ? "application/pdf" : "audio/*"}
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file, selectedType);
                e.target.value = "";
              }}
              className="ki-soft cursor-pointer rounded-md border-dashed p-6 text-sm text-muted transition-colors hover:border-signal file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-signal file:px-4 file:py-2 file:font-semibold file:text-signal-ink"
            />
            {busy && (
              <p className="inline-flex items-center justify-center gap-2 text-center text-xs text-muted">
                <span className="h-4 w-4 animate-spin rounded-full border-[1.5px] border-current/25 border-t-current" />
                Datei wird hochgeladen und zur Verarbeitung vorbereitet
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
      </div>
    </div>
  );
}
