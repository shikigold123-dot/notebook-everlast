"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { ActionButton } from "@/components/ui/ActionButton";
import { UPLOAD_MAX_SIZES } from "@/lib/ingestion/upload-limits";
import type { SourceListItem } from "./SourcesPanel";

const SIZE_ERROR: Record<"pdf" | "audio", string> = {
  pdf: "PDF-Dateien dürfen höchstens 15 MB groß sein.",
  audio: "Audio-Dateien dürfen höchstens 25 MB groß sein.",
};

export function SourceForm({
  notebookId,
  onCreated,
}: {
  notebookId: string;
  onCreated: (source: SourceListItem) => void;
}) {
  const [type, setType] = useState<SourceListItem["type"]>("text");
  const [textValue, setTextValue] = useState("");
  const [urlValue, setUrlValue] = useState("");
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
    if (!urlValue.trim()) return;
    await submitSource({ type, originalUrl: urlValue });
    setUrlValue("");
  }

  async function handleFileSelect(file: File, fileType: "pdf" | "audio") {
    if (file.size > UPLOAD_MAX_SIZES[fileType]) {
      setError(SIZE_ERROR[fileType]);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: `/api/notebooks/${notebookId}/blob-upload-token`,
        clientPayload: JSON.stringify({ type: fileType }),
      });
      await submitSource({
        type: fileType,
        title: file.name,
        blobUrl: blob.url,
      });
    } catch {
      setError("Der Upload ist fehlgeschlagen — bitte nochmal versuchen.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-b-[1.5px] border-ink pb-3">
      <select
        value={type}
        onChange={(e) =>
          setType(e.target.value as SourceListItem["type"])
        }
        className="border-[1.5px] border-ink bg-paper px-2 py-1 text-sm"
      >
        <option value="text">Text</option>
        <option value="pdf">PDF</option>
        <option value="url">Website</option>
        <option value="youtube">YouTube</option>
        <option value="audio">Audio</option>
      </select>

      {type === "text" && (
        <>
          <textarea
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            placeholder="Text einfügen …"
            className="border-[1.5px] border-ink bg-paper px-2 py-1 text-sm"
            rows={3}
          />
          <ActionButton onClick={handleTextSubmit} disabled={busy}>
            Hinzufügen
          </ActionButton>
        </>
      )}

      {(type === "url" || type === "youtube") && (
        <>
          <input
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder={type === "youtube" ? "YouTube-URL …" : "Website-URL …"}
            className="border-[1.5px] border-ink bg-paper px-2 py-1 text-sm"
          />
          <ActionButton onClick={handleUrlSubmit} disabled={busy}>
            Hinzufügen
          </ActionButton>
        </>
      )}

      {(type === "pdf" || type === "audio") && (
        <input
          type="file"
          accept={type === "pdf" ? "application/pdf" : "audio/*"}
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file, type);
            e.target.value = "";
          }}
          className="text-sm"
        />
      )}

      {error && (
        <p className="border-[1.5px] border-ink bg-paper px-2 py-1 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
