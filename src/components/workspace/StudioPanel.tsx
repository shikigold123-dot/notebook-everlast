"use client";

import { useState } from "react";
import { ActionButton } from "@/components/ui/ActionButton";
import type { ArtifactKind } from "@/db/repo/artifacts";

export type ArtifactListItem = {
  id: string;
  type: ArtifactKind;
  status: "pending" | "ready" | "error";
  content: unknown;
  createdAt: string;
};

type JsonRecord = Record<string, unknown>;

const ARTIFACT_LABELS: Record<ArtifactKind, string> = {
  study_guide: "Lernleitfaden",
  faq: "Fragen & Antworten",
  timeline: "Zeitleiste",
  briefing: "Briefing",
  mindmap: "Mind Map",
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function renderList(items: unknown[]) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {items.map((item, index) => (
        <li key={`${asString(item)}-${index}`} className="leading-6">
          {asString(item)}
        </li>
      ))}
    </ul>
  );
}

function renderFaq(content: JsonRecord) {
  const items = asArray(content.items);
  return (
    <ol className="flex flex-col gap-3">
      {items.map((item, index) => {
        const row = asRecord(item);
        return (
          <li key={index} className="border-t-[1.5px] border-ink pt-3">
            <h4 className="font-bold">{asString(row.question)}</h4>
            <p className="mt-1 whitespace-pre-wrap leading-6">
              {asString(row.answer)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function renderStudyGuide(content: JsonRecord) {
  const sections = asArray(content.sections);
  const quiz = asArray(content.quiz);
  const glossary = asArray(content.glossary);

  return (
    <div className="flex flex-col gap-4">
      {asString(content.title) && (
        <h4 className="text-base font-bold">{asString(content.title)}</h4>
      )}
      {sections.map((section, index) => {
        const row = asRecord(section);
        return (
          <section key={index} className="border-t-[1.5px] border-ink pt-3">
            <h5 className="font-bold">{asString(row.heading)}</h5>
            {renderList(asArray(row.bullets))}
          </section>
        );
      })}
      {quiz.length > 0 && (
        <section className="border-t-[1.5px] border-ink pt-3">
          <h5 className="label-caps">Quiz</h5>
          <ol className="mt-2 flex flex-col gap-2">
            {quiz.map((item, index) => {
              const row = asRecord(item);
              return (
                <li key={index}>
                  <p className="font-bold">{asString(row.question)}</p>
                  <p className="leading-6">{asString(row.answer)}</p>
                </li>
              );
            })}
          </ol>
        </section>
      )}
      {glossary.length > 0 && (
        <section className="border-t-[1.5px] border-ink pt-3">
          <h5 className="label-caps">Glossar</h5>
          <dl className="mt-2 flex flex-col gap-2">
            {glossary.map((item, index) => {
              const row = asRecord(item);
              return (
                <div key={index}>
                  <dt className="font-bold">{asString(row.term)}</dt>
                  <dd className="leading-6">{asString(row.definition)}</dd>
                </div>
              );
            })}
          </dl>
        </section>
      )}
    </div>
  );
}

function renderTimeline(content: JsonRecord) {
  const events = asArray(content.events);
  return (
    <ol className="flex flex-col gap-3">
      {events.map((event, index) => {
        const row = asRecord(event);
        return (
          <li key={index} className="border-l-[1.5px] border-ink pl-3">
            <p className="label-caps text-ink/60">{asString(row.date_label)}</p>
            <h4 className="font-bold">{asString(row.title)}</h4>
            <p className="mt-1 leading-6">{asString(row.description)}</p>
          </li>
        );
      })}
    </ol>
  );
}

function renderBriefing(content: JsonRecord) {
  return (
    <div className="flex flex-col gap-3">
      {asString(content.summary) && (
        <p className="whitespace-pre-wrap leading-6">{asString(content.summary)}</p>
      )}
      {[
        ["Kernpunkte", content.key_points],
        ["Zitate", content.quotes],
        ["Offene Fragen", content.open_questions],
      ].map(([label, items]) => {
        const rows = asArray(items);
        if (rows.length === 0) return null;
        return (
          <section key={String(label)} className="border-t-[1.5px] border-ink pt-3">
            <h4 className="label-caps">{String(label)}</h4>
            {renderList(rows)}
          </section>
        );
      })}
    </div>
  );
}

function renderMindNode(node: unknown, path: string) {
  const row = asRecord(node);
  const children = asArray(row.children);

  return (
    <li key={path}>
      <span className="inline-block border-[1.5px] border-ink bg-paper px-2 py-1">
        {asString(row.label)}
      </span>
      {children.length > 0 && (
        <ul className="ml-3 mt-2 flex flex-col gap-2 border-l-[1.5px] border-ink pl-3">
          {children.map((child, index) =>
            renderMindNode(child, `${path}-${index}`)
          )}
        </ul>
      )}
    </li>
  );
}

function renderArtifact(artifact: ArtifactListItem) {
  const content = asRecord(artifact.content);

  if (artifact.type === "faq") return renderFaq(content);
  if (artifact.type === "study_guide") return renderStudyGuide(content);
  if (artifact.type === "timeline") return renderTimeline(content);
  if (artifact.type === "briefing") return renderBriefing(content);
  if (artifact.type === "mindmap") {
    return <ul>{renderMindNode(content, artifact.id)}</ul>;
  }

  return (
    <pre className="overflow-auto text-xs">
      {JSON.stringify(artifact.content, null, 2)}
    </pre>
  );
}

export function StudioPanel({
  notebookId,
  initialArtifacts,
  readySourceCount,
}: {
  notebookId: string;
  initialArtifacts: ArtifactListItem[];
  readySourceCount: number;
}) {
  const [artifacts, setArtifacts] = useState(initialArtifacts ?? []);
  const [busyType, setBusyType] = useState<ArtifactKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasReadySources = readySourceCount > 0;

  async function handleGenerate(type: ArtifactKind) {
    if (!hasReadySources || busyType) return;

    setBusyType(type);
    setError(null);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/artifacts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Artefakt konnte nicht generiert werden.");
        return;
      }
      setArtifacts((prev) => [...prev, json.artifact]);
    } catch {
      setError("Keine Verbindung — bitte nochmal versuchen.");
    } finally {
      setBusyType(null);
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        {Object.entries(ARTIFACT_LABELS).map(([type, label]) => (
          <ActionButton
            key={type}
            type="button"
            variant="outline"
            disabled={!hasReadySources || Boolean(busyType)}
            onClick={() => handleGenerate(type as ArtifactKind)}
            className="min-h-10 px-2 text-left"
          >
            {busyType === type ? "Läuft ..." : label}
          </ActionButton>
        ))}
      </div>

      {!hasReadySources && (
        <p className="text-sm text-ink/60">
          Füge zuerst eine bereite Quelle hinzu.
        </p>
      )}

      {error && (
        <p className="border-[1.5px] border-ink bg-paper px-2 py-1 text-sm">
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {artifacts.length === 0 ? (
          <p className="text-sm text-ink/60">
            Noch keine Studio-Artefakte generiert.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {artifacts.map((artifact) => (
              <li
                key={artifact.id}
                className="border-[1.5px] border-ink bg-paper p-3 text-sm"
              >
                <p className="label-caps mb-3 text-ink/60">
                  {ARTIFACT_LABELS[artifact.type]}
                </p>
                {renderArtifact(artifact)}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
