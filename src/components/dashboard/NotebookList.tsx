"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/ActionButton";

export type NotebookListItem = {
  id: string;
  title: string;
  createdAt: string;
};

export function NotebookList({
  notebooks,
}: {
  notebooks: NotebookListItem[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/notebooks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Das hat nicht geklappt — bitte nochmal versuchen.");
      return;
    }
    const { notebook } = await res.json();
    router.push(`/notebook/${notebook.id}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="label-caps !text-sm">Deine Dossiers</h1>
        <ActionButton onClick={handleCreate} disabled={busy}>
          {busy ? "Wird angelegt …" : "Neues Dossier"}
        </ActionButton>
      </div>

      {error && (
        <p className="border-[1.5px] border-ink bg-signal px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {notebooks.length === 0 ? (
        <p className="border-[1.5px] border-dashed border-ink bg-paper p-6 text-sm">
          Noch keine Dossiers. Leg dein erstes an — Quellen rein, Fragen
          stellen, Podcast raus.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notebooks.map((nb, i) => (
            <li key={nb.id}>
              <Link
                href={`/notebook/${nb.id}`}
                className="block border-[1.5px] border-ink bg-paper p-4 transition-colors hover:bg-signal"
              >
                <span className="label-caps block text-ink/60">
                  {`DOSSIER ${String(i + 1).padStart(3, "0")}`}
                </span>
                <span className="mt-2 block text-lg font-medium">
                  {nb.title}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
