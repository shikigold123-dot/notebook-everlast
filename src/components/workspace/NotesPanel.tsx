"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";

export type NoteListItem = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

const EMPTY_DRAFT = { id: null as string | null, title: "", content: "" };

export function NotesPanel({
  notebookId,
  initialNotes,
  selectedNoteIds,
  onSelectedNoteIdsChange,
  onNotesChange,
  readOnly = false,
}: {
  notebookId: string;
  initialNotes: NoteListItem[];
  selectedNoteIds: string[];
  onSelectedNoteIdsChange: (ids: string[]) => void;
  onNotesChange?: (notes: NoteListItem[]) => void;
  readOnly?: boolean;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateNotes(next: NoteListItem[]) {
    setNotes(next);
    onNotesChange?.(next);
  }

  function openCreate() {
    setDraft(EMPTY_DRAFT);
    setError(null);
    setIsOpen(true);
  }

  function openEdit(note: NoteListItem) {
    setDraft({ id: note.id, title: note.title, content: note.content });
    setError(null);
    setIsOpen(true);
  }

  async function save() {
    if (readOnly || busy) return;
    if (!draft.title.trim() || !draft.content.trim()) {
      setError("Titel und Inhalt dürfen nicht leer sein.");
      return;
    }
    setBusy(true);
    setError(null);
    const url = draft.id
      ? `/api/notebooks/${notebookId}/notes/${draft.id}`
      : `/api/notebooks/${notebookId}/notes`;
    try {
      const response = await fetch(url, {
        method: draft.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: draft.title, content: draft.content }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Notiz konnte nicht gespeichert werden.");
      const next = draft.id
        ? notes.map((note) => (note.id === draft.id ? json.note : note))
        : [...notes, json.note];
      updateNotes(next);
      if (!draft.id) onSelectedNoteIdsChange([...selectedNoteIds, json.note.id]);
      setIsOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Notiz konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(noteId: string) {
    if (readOnly || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/notebooks/${notebookId}/notes/${noteId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Notiz konnte nicht gelöscht werden.");
      updateNotes(notes.filter((note) => note.id !== noteId));
      onSelectedNoteIdsChange(selectedNoteIds.filter((id) => id !== noteId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Notiz konnte nicht gelöscht werden.");
    } finally {
      setBusy(false);
    }
  }

  const allSelected = notes.length > 0 && notes.every((note) => selectedNoteIds.includes(note.id));

  return (
    <div className="flex h-full flex-col gap-4">
      {!readOnly && (
        <button
          type="button"
          onClick={openCreate}
          className="ki-pill ki-interactive flex w-full cursor-pointer items-center justify-center gap-2 p-3 text-sm font-semibold text-ink"
        >
          <Icon name="plus" size={16} />
          Notiz anlegen
        </button>
      )}

      {error && !isOpen && <p className="text-sm text-danger" role="alert">{error}</p>}

      {notes.length > 0 && (
        <label className="flex cursor-pointer items-center justify-end gap-2 border-b border-line/50 px-1 pb-2.5">
          <span className="label-caps text-muted">Alle im KI-Kontext</span>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(event) => onSelectedNoteIdsChange(event.target.checked ? notes.map((note) => note.id) : [])}
            className="h-4 w-4 cursor-pointer"
          />
        </label>
      )}

      <ul className="flex flex-col gap-2 overflow-y-auto">
        {notes.length === 0 && (
          <li className="ki-raised px-4 py-5 text-sm leading-6 text-muted">
            Noch keine Notizen. Halte eigene Erkenntnisse fest und nutze sie gezielt als KI-Kontext.
          </li>
        )}
        {notes.map((note) => (
          <li key={note.id} className="ki-interactive rounded-md border-[1.5px] border-line bg-paper p-3 text-sm hover:bg-panel-soft">
            <div className="flex items-start gap-3">
              <button type="button" onClick={() => openEdit(note)} className="min-w-0 flex-1 cursor-pointer text-left">
                <span className="block truncate font-semibold">{note.title}</span>
                <span className="mt-1.5 line-clamp-3 block text-xs leading-5 text-muted">{note.content}</span>
              </button>
              <input
                type="checkbox"
                aria-label={`${note.title} im KI-Kontext`}
                checked={selectedNoteIds.includes(note.id)}
                onChange={() => onSelectedNoteIdsChange(
                  selectedNoteIds.includes(note.id)
                    ? selectedNoteIds.filter((id) => id !== note.id)
                    : [...selectedNoteIds, note.id]
                )}
                className="mt-1 h-4 w-4 cursor-pointer"
              />
            </div>
            {!readOnly && (
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => openEdit(note)} className="ki-pill ki-interactive min-h-8 cursor-pointer px-2.5 text-xs">Bearbeiten</button>
                <button type="button" onClick={() => remove(note.id)} className="ki-pill ki-interactive inline-flex min-h-8 cursor-pointer items-center gap-1 px-2.5 text-xs hover:border-danger hover:text-danger">
                  <Icon name="trash" size={13} /> Löschen
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={draft.id ? "Notiz bearbeiten" : "Neue Notiz"}>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Titel
            <input
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              maxLength={160}
              className="border-[1.5px] border-line bg-paper px-3 py-2.5 font-normal outline-none focus:border-ink"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Inhalt
            <textarea
              value={draft.content}
              onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
              maxLength={30000}
              rows={12}
              className="resize-y border-[1.5px] border-line bg-paper px-3 py-2.5 font-normal leading-6 outline-none focus:border-ink"
            />
          </label>
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <button type="button" disabled={busy} onClick={save} className="bg-signal px-4 py-3 text-sm font-bold text-signal-ink disabled:opacity-50">
            {busy ? "Speichert …" : "Notiz speichern"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
