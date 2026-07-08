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
  isDemo: boolean;
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
  const [currentSources, setCurrentSources] = useState(sources);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const readySourceCount = currentSources.filter(
    (source) => source.status === "ready"
  ).length;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-baseline justify-between border-b-2 border-ink bg-paper px-4 py-2">
        <Link href="/" className="text-lg font-bold tracking-widest">
          EVERLAST
        </Link>
        <div className="flex items-center gap-2">
          {notebook.isDemo && (
            <span className="label-caps border-[1.5px] border-ink px-1.5 py-0.5">
              DEMO
            </span>
          )}
          <span className="label-caps">
            DOSSIER {notebook.number} / {notebook.title.toUpperCase()}
          </span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 lg:grid-cols-[280px_1fr_280px]">
        <Panel label="Quellen" count={currentSources.length}>
          <SourcesPanel
            notebookId={notebook.id}
            initialSources={currentSources}
            selectedSourceId={selectedSourceId}
            onSelectSource={setSelectedSourceId}
            onSourcesChange={setCurrentSources}
            readOnly={notebook.isDemo}
          />
        </Panel>

        <Panel label="Chat">
          <ChatPanel
            notebookId={notebook.id}
            initialMessages={chatMessages}
            readySourceCount={readySourceCount}
            onSelectSource={setSelectedSourceId}
            readOnly={notebook.isDemo}
          />
        </Panel>

        <Panel label="Studio">
          <StudioPanel
            notebookId={notebook.id}
            initialArtifacts={artifacts}
            initialAudioOverview={audioOverview}
            readySourceCount={readySourceCount}
            readOnly={notebook.isDemo}
          />
        </Panel>
      </div>
    </div>
  );
}
