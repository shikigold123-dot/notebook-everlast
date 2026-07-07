"use client";

import { useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { SourcesPanel, type SourceListItem } from "./SourcesPanel";
import { ChatPanel, type ChatMessageItem } from "./ChatPanel";
import {
  StudioPanel,
  type ArtifactListItem,
  type AudioOverviewItem,
} from "./StudioPanel";

export type WorkspaceNotebook = {
  id: string;
  title: string;
  /** Laufende Nummer des Besuchers, z. B. "004" */
  number: string;
};

export function NotebookWorkspace({
  notebook,
  sources,
  chatMessages,
  artifacts,
  audioOverview,
}: {
  notebook: WorkspaceNotebook;
  sources: SourceListItem[];
  chatMessages: ChatMessageItem[];
  artifacts: ArtifactListItem[];
  audioOverview: AudioOverviewItem | null;
}) {
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const readySourceCount = sources.filter(
    (source) => source.status === "ready"
  ).length;

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
          <SourcesPanel
            notebookId={notebook.id}
            initialSources={sources}
            selectedSourceId={selectedSourceId}
            onSelectSource={setSelectedSourceId}
          />
        </Panel>

        <Panel label="Chat">
          <ChatPanel
            notebookId={notebook.id}
            initialMessages={chatMessages}
            readySourceCount={readySourceCount}
            onSelectSource={setSelectedSourceId}
          />
        </Panel>

        <Panel label="Studio">
          <StudioPanel
            notebookId={notebook.id}
            initialArtifacts={artifacts}
            initialAudioOverview={audioOverview}
            readySourceCount={readySourceCount}
          />
        </Panel>
      </div>
    </div>
  );
}
