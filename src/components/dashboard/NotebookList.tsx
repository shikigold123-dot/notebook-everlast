"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/ActionButton";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";

export type NotebookListItem = {
  id: string;
  title: string;
  isDemo?: boolean;
  createdAt: string;
};

const DATE_FORMAT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function NotebookList({
  notebooks,
}: {
  notebooks: NotebookListItem[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadingNotebookId, setLoadingNotebookId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      const trimmed = newTitle.trim();
      const res = await fetch("/api/notebooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(trimmed ? { title: trimmed } : {}),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Das hat nicht geklappt — bitte nochmal versuchen.");
        return;
      }
      const { notebook } = await res.json();
      setCreateOpen(false);
      router.push(`/notebook/${notebook.id}`);
    } catch {
      setError("Keine Verbindung — bitte nochmal versuchen.");
    } finally {
      setBusy(false);
    }
  }

  function openCreate() {
    setNewTitle("");
    setError(null);
    setCreateOpen(true);
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Möchtest du dieses Notebook wirklich löschen?")) {
      return;
    }
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/notebooks/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Löschen fehlgeschlagen.");
        return;
      }
      router.refresh();
    } catch {
      setError("Verbindung zum Server fehlgeschlagen.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Deine Notebooks
          </h2>
          <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted">
            Sammle Quellen, starte Deep Research und arbeite jeden Fund als
            belastbares Notebook weiter.
          </p>
        </div>
        <ActionButton
          onClick={openCreate}
          disabled={busy || loadingNotebookId !== null}
        >
          <Icon name="plus" size={16} />
          Neues Notebook
        </ActionButton>
      </div>

      {createOpen && (
        <Modal
          isOpen
          onClose={() => (busy ? undefined : setCreateOpen(false))}
          title="Neues Notebook"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
            className="flex flex-col gap-4"
          >
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="label-caps text-muted">Titel</span>
              <input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                maxLength={200}
                placeholder="z. B. KI-Wettlauf 2026"
                disabled={busy}
                className="ki-soft rounded-md px-3 py-2.5 text-sm outline-none transition-colors focus:border-signal"
              />
              <span className="text-xs leading-5 text-muted">
                Optional — leer lassen für „Unbenanntes Notebook“.
              </span>
            </label>

            {error && (
              <p
                className="flex items-center gap-2.5 rounded-sm border-[1.5px] border-line bg-paper px-4 py-3 text-sm text-danger"
                role="alert"
              >
                <Icon name="alert" size={16} className="shrink-0" />
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                disabled={busy}
                className="ki-pill ki-interactive cursor-pointer px-4 py-2 text-sm font-semibold text-ink disabled:opacity-45"
              >
                Abbrechen
              </button>
              <ActionButton type="submit" loading={busy} disabled={busy}>
                Erstellen
              </ActionButton>
            </div>
          </form>
        </Modal>
      )}

      {error && !createOpen && (
        <p
          className="flex items-center gap-2.5 rounded-sm border-[1.5px] border-line bg-paper px-4 py-3 text-sm text-danger"
          role="alert"
        >
          <Icon name="alert" size={16} />
          {error}
        </p>
      )}

      {notebooks.length === 0 ? (
        <div className="ki-card grid place-items-center border-dashed px-6 py-14 text-center">
          <span className="ki-tile h-12 w-12">
            <Icon name="file" size={20} />
          </span>
          <p className="label-caps mt-4 text-muted">Archiv leer</p>
          <p className="mt-3 max-w-md text-sm leading-6 text-ink/80">
            Noch keine Notebooks. Leg dein erstes an, füge Quellen oder eine
            Deep-Research-Frage hinzu und arbeite danach mit Chat, Zitaten und
            Studio-Artefakten weiter.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {notebooks.map((nb, i) => (
            <li key={nb.id} className="group relative">
              <Link
                href={`/notebook/${nb.id}`}
                onClick={() => setLoadingNotebookId(nb.id)}
                className="ki-card ki-interactive flex min-h-48 flex-col p-5"
              >
                <span className="label-caps flex items-center gap-1.5 text-muted">
                  {loadingNotebookId === nb.id ? (
                    <Icon
                      name="retry"
                      size={14}
                      className="animate-spin text-ink"
                    />
                  ) : (
                    <Icon name={nb.isDemo ? "spark" : "file"} size={14} />
                  )}
                  {nb.isDemo
                    ? "DEMO-DOSSIER"
                    : `DOSSIER ${String(i + 1).padStart(3, "0")}`}
                </span>
                <span className="mt-3 flex items-start justify-between gap-2 text-lg font-semibold leading-snug tracking-tight">
                  <span
                    className={loadingNotebookId === nb.id ? "animate-pulse" : ""}
                  >
                    {nb.title}
                  </span>
                  {nb.isDemo && (
                    <span className="label-caps ki-pill shrink-0 px-2.5 py-1 text-muted">
                      Lesen
                    </span>
                  )}
                </span>
                <span className="mt-auto flex items-end justify-between gap-3 pt-8">
                  <span className="label-caps text-muted">
                    {DATE_FORMAT.format(new Date(nb.createdAt))}
                  </span>
                  <span className="ki-tile h-8 w-8 transition-colors duration-200 group-hover:border-signal group-hover:bg-signal group-hover:text-signal-ink">
                    <Icon name="chevronRight" size={14} />
                  </span>
                </span>
                <span
                  className={`mt-4 block h-1 rounded-full transition-colors duration-300 ${
                    loadingNotebookId === nb.id
                      ? "animate-pulse bg-signal"
                      : "bg-line group-hover:bg-signal"
                  }`}
                />
              </Link>

              {!nb.isDemo && (
                <button
                  onClick={(e) => handleDelete(e, nb.id)}
                  disabled={deletingId === nb.id || loadingNotebookId !== null}
                  className="ki-tile absolute right-4 top-4 z-10 h-9 w-9 cursor-pointer bg-paper opacity-0 transition-all duration-200 hover:border-danger hover:bg-danger hover:text-danger-ink focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-30"
                  title="Notebook löschen"
                >
                  {deletingId === nb.id ? (
                    <Icon name="retry" size={13} className="animate-spin" />
                  ) : (
                    <Icon name="trash" size={15} />
                  )}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
