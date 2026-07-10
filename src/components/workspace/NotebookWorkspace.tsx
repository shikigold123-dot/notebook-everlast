"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/Panel";
import type { ChatCitation } from "@/db/repo/chat";
import { SourcesPanel, type SourceListItem } from "./SourcesPanel";
import { ChatPanel, type ChatMessageItem } from "./ChatPanel";
import { NotesPanel, type NoteListItem } from "./NotesPanel";
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

const COLUMN_LIMITS = {
  left: { min: 260, max: 380, initial: 300 },
  right: { min: 280, max: 390, initial: 320 },
  centerMin: 430,
  chrome: 52,
};

type ColumnSide = "left" | "right";
type ColumnWidths = Record<ColumnSide, number>;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function ColumnResizeHandle({
  side,
  label,
  value,
  onAdjust,
  onPointerDown,
  onReset,
}: {
  side: ColumnSide;
  label: string;
  value: number;
  onAdjust: (side: ColumnSide, delta: number) => void;
  onPointerDown: (
    side: ColumnSide,
    event: React.PointerEvent<HTMLDivElement>
  ) => void;
  onReset: () => void;
}) {
  return (
    <div
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemax={COLUMN_LIMITS[side].max}
      aria-valuemin={COLUMN_LIMITS[side].min}
      aria-valuenow={value}
      className="group hidden cursor-col-resize items-stretch justify-center rounded-full outline-none lg:flex"
      role="separator"
      tabIndex={0}
      title="Spaltenbreite ziehen"
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onAdjust(side, side === "left" ? -16 : 16);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          onAdjust(side, side === "left" ? 16 : -16);
        }
      }}
      onPointerDown={(event) => onPointerDown(side, event)}
    >
      <span className="my-10 w-1 rounded-full bg-line transition-colors duration-200 group-hover:bg-signal group-focus-visible:bg-signal" />
    </div>
  );
}

export function NotebookWorkspace({
  notebook,
  sources,
  chatMessages,
  artifacts,
  audioOverviews,
  notes = [],
}: {
  notebook: WorkspaceNotebook;
  sources: SourceListItem[];
  chatMessages: ChatMessageItem[];
  artifacts: ArtifactListItem[];
  audioOverviews: AudioOverviewItem[];
  notes?: NoteListItem[];
}) {
  const [currentSources, setCurrentSources] = useState(sources);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedCitation, setSelectedCitation] =
    useState<ChatCitation | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [leftView, setLeftView] = useState<"sources" | "notes">("sources");
  const [currentNotes, setCurrentNotes] = useState(notes);
  const [selectedNoteIds, setSelectedNoteIds] = useState(() => notes.map((note) => note.id));
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>(() =>
    sources.map((s) => s.id)
  );
  const [prevSourceIds, setPrevSourceIds] = useState<string[]>(() =>
    sources.map((s) => s.id)
  );
  const [columns, setColumns] = useState<ColumnWidths>({
    left: COLUMN_LIMITS.left.initial,
    right: COLUMN_LIMITS.right.initial,
  });
  const workspaceRef = useRef<HTMLDivElement>(null);

  // Sync selectedSourceIds on creation/deletion — derived during render
  // (kein Effect, siehe https://react.dev/learn/you-might-not-need-an-effect)
  const currentIds = currentSources.map((s) => s.id);
  const addedIds = currentIds.filter((id) => !prevSourceIds.includes(id));
  const deletedIds = prevSourceIds.filter((id) => !currentIds.includes(id));
  if (addedIds.length > 0 || deletedIds.length > 0) {
    setPrevSourceIds(currentIds);
    setSelectedSourceIds((prev) => {
      const next = prev.filter((id) => currentIds.includes(id));
      next.push(...addedIds);
      return Array.from(new Set(next));
    });
  }

  const readySourceCount = currentSources.filter(
    (source) => source.status === "ready" && selectedSourceIds.includes(source.id)
  ).length;

  function handleSelectSource(sourceId: string | null) {
    setSelectedSourceId(sourceId);
    setSelectedCitation(null);
  }

  function handleSelectCitation(sourceId: string, citation?: ChatCitation) {
    if (currentNotes.some((note) => note.id === sourceId)) {
      setLeftCollapsed(false);
      setLeftView("notes");
      setSelectedSourceId(null);
      setSelectedCitation(null);
      return;
    }
    setLeftCollapsed(false);
    setLeftView("sources");
    setSelectedSourceId(sourceId);
    setSelectedCitation(citation ?? null);
  }

  function adjustColumn(side: ColumnSide, delta: number) {
    setColumns((current) => ({
      ...current,
      [side]: clamp(
        current[side] + delta,
        COLUMN_LIMITS[side].min,
        COLUMN_LIMITS[side].max
      ),
    }));
  }

  function startColumnResize(
    side: ColumnSide,
    event: React.PointerEvent<HTMLDivElement>
  ) {
    if (!workspaceRef.current) return;
    event.preventDefault();

    const rect = workspaceRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const startColumns = columns;
    const maxLeft = rect.width - startColumns.right - COLUMN_LIMITS.centerMin - COLUMN_LIMITS.chrome;
    const maxRight = rect.width - startColumns.left - COLUMN_LIMITS.centerMin - COLUMN_LIMITS.chrome;

    function handleMove(moveEvent: PointerEvent) {
      const deltaX = moveEvent.clientX - startX;
      setColumns((current) => {
        if (side === "left") {
          return {
            ...current,
            left: clamp(
              startColumns.left + deltaX,
              COLUMN_LIMITS.left.min,
              Math.min(COLUMN_LIMITS.left.max, maxLeft)
            ),
          };
        }

        return {
          ...current,
          right: clamp(
            startColumns.right - deltaX,
            COLUMN_LIMITS.right.min,
            Math.min(COLUMN_LIMITS.right.max, maxRight)
          ),
        };
      });
    }

    function stopResize() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }

  function resetColumns() {
    setColumns({
      left: COLUMN_LIMITS.left.initial,
      right: COLUMN_LIMITS.right.initial,
    });
  }

  return (
    <div className="ki-shell flex min-h-dvh flex-col px-3 pb-16 pt-3 sm:px-4 lg:h-dvh lg:pb-3 lg:pt-3">
      <header className="ki-card mx-auto mb-3 flex w-full max-w-[1720px] flex-col gap-3 px-5 py-3 sm:flex-row sm:items-end sm:justify-between lg:px-6">
        <Link
          href="/"
          className="group flex items-center gap-2.5 font-sans tracking-tight"
        >
          <span className="grid h-9 w-9 place-items-center rounded-[0.75rem] bg-signal text-signal-ink shadow-glow transition-transform duration-200 group-hover:-translate-y-0.5">
            <Icon name="spark" size={18} />
          </span>
          <div>
            <span className="block text-xl font-bold leading-none tracking-wider sm:text-2xl">
              EVERLAST
            </span>
            <span className="mt-1 block font-mono text-[10px] uppercase leading-none tracking-widest text-muted">
              NotebookLM-Alternative{" "}
              <span className="font-sans text-xs lowercase text-ink/70">
                by Matin
              </span>
            </span>
          </div>
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {notebook.isDemo && (
            <span className="label-caps rounded-sm bg-signal px-2.5 py-1 text-signal-ink">
              DEMO
            </span>
          )}
          <span className="label-caps ki-pill max-w-72 truncate px-3 py-1.5 text-muted">
            DOSSIER {notebook.number} / {notebook.title.toUpperCase()}
          </span>
        </div>
      </header>

      <div
        ref={workspaceRef}
        className="mx-auto grid w-full max-w-[1720px] flex-1 grid-cols-1 gap-3 lg:min-h-0 lg:grid-cols-[var(--left-column)_10px_minmax(430px,1fr)_10px_var(--right-column)]"
        style={
          {
            "--left-column": leftCollapsed ? "52px" : `${columns.left}px`,
            "--right-column": `${columns.right}px`,
          } as React.CSSProperties
        }
      >
        {leftCollapsed ? (
          <div
            className="ki-panel flex h-full flex-col items-center gap-4 py-4"
            style={{ width: "52px" }}
          >
            <button
              type="button"
              onClick={() => setLeftCollapsed(false)}
              className="ki-tile ki-interactive h-9 w-9 cursor-pointer"
              title="Quellen einblenden"
            >
              <Icon name="sidebar" size={17} />
            </button>
            <div className="flex flex-1 items-center justify-center">
              <span
                className="label-caps tracking-widest text-muted"
                style={{
                  writingMode: "vertical-rl",
                  transform: "rotate(180deg)",
                }}
              >
                QUELLEN
              </span>
            </div>
          </div>
        ) : (
          <Panel
            label={leftView === "sources" ? "Quellen" : "Notizen"}
            count={leftView === "sources" ? currentSources.length : currentNotes.length}
            headerAction={
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setLeftView(leftView === "sources" ? "notes" : "sources")}
                  className="ki-pill ki-interactive min-h-10 cursor-pointer px-3 text-xs font-semibold"
                >
                  {leftView === "sources" ? "Notizen" : "Quellen"}
                </button>
                <button
                  type="button"
                  onClick={() => setLeftCollapsed(true)}
                  className="ki-tile ki-interactive h-10 w-10 cursor-pointer"
                  title="Linken Bereich ausblenden"
                >
                  <Icon name="sidebar" size={17} />
                </button>
              </div>
            }
          >
            {leftView === "sources" ? (
              <SourcesPanel
                notebookId={notebook.id}
                initialSources={currentSources}
                selectedSourceId={selectedSourceId}
                selectedCitation={selectedCitation}
                onSelectSource={handleSelectSource}
                onSourcesChange={setCurrentSources}
                readOnly={notebook.isDemo}
                selectedSourceIds={selectedSourceIds}
                onSelectedSourceIdsChange={setSelectedSourceIds}
              />
            ) : (
              <NotesPanel
                notebookId={notebook.id}
                initialNotes={currentNotes}
                selectedNoteIds={selectedNoteIds}
                onSelectedNoteIdsChange={setSelectedNoteIds}
                onNotesChange={setCurrentNotes}
                readOnly={notebook.isDemo}
              />
            )}
          </Panel>
        )}

        {leftCollapsed ? (
          <div className="hidden lg:block w-0" />
        ) : (
          <ColumnResizeHandle
            side="left"
            label="Breite zwischen Quellen und Chat verschieben"
            value={columns.left}
            onAdjust={adjustColumn}
            onPointerDown={startColumnResize}
            onReset={resetColumns}
          />
        )}

        <Panel label="Chat">
          <ChatPanel
            notebookId={notebook.id}
            initialMessages={chatMessages}
            readySourceCount={readySourceCount}
            onSelectSource={handleSelectCitation}
            readOnly={notebook.isDemo}
            selectedSourceIds={selectedSourceIds}
            selectedNoteIds={selectedNoteIds}
          />
        </Panel>

        <ColumnResizeHandle
          side="right"
          label="Breite zwischen Chat und Studio verschieben"
          value={columns.right}
          onAdjust={adjustColumn}
          onPointerDown={startColumnResize}
          onReset={resetColumns}
        />

        <Panel label="Studio">
          <StudioPanel
            notebookId={notebook.id}
            initialArtifacts={artifacts}
            initialAudioOverviews={audioOverviews}
            readySourceCount={readySourceCount}
            readOnly={notebook.isDemo}
            selectedSourceIds={selectedSourceIds}
            selectedNoteIds={selectedNoteIds}
            notebookTitle={notebook.title}
          />
        </Panel>
      </div>
    </div>
  );
}
