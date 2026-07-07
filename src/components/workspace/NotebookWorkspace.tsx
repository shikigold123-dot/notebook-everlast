import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { SourcesPanel, type SourceListItem } from "./SourcesPanel";

export type WorkspaceNotebook = {
  id: string;
  title: string;
  /** Laufende Nummer des Besuchers, z. B. "004" */
  number: string;
};

export function NotebookWorkspace({
  notebook,
  sources,
}: {
  notebook: WorkspaceNotebook;
  sources: SourceListItem[];
}) {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-baseline justify-between border-b-2 border-ink bg-paper px-4 py-2">
        <Link href="/" className="text-lg font-bold tracking-widest">
          EVERLAST
        </Link>
        <span className="label-caps">
          DOSSIER {notebook.number} / {notebook.title.toUpperCase()}
        </span>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 lg:grid-cols-[280px_1fr_280px]">
        <Panel label="Quellen" count={sources.length}>
          <SourcesPanel notebookId={notebook.id} initialSources={sources} />
        </Panel>

        <Panel label="Chat">
          <div className="flex h-full flex-col justify-end gap-3">
            <p className="text-sm text-ink/60">
              Füge zuerst Quellen hinzu, dann kannst du hier Fragen stellen —
              mit Zitaten direkt aus deinen Dokumenten.
            </p>
            <input
              disabled
              placeholder="Frag deine Quellen …"
              className="border-[1.5px] border-ink bg-paper px-3 py-2 text-sm disabled:opacity-40"
            />
          </div>
        </Panel>

        <Panel label="Studio">
          <ul className="flex flex-col gap-2 text-sm text-ink/60">
            <li className="border border-dashed border-ink p-2">
              ▶ Audio Overview
            </li>
            <li className="border border-dashed border-ink p-2">
              Study Guide
            </li>
            <li className="border border-dashed border-ink p-2">Mind Map</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
