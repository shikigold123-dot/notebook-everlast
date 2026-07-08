"use client";

import { useEffect, useState } from "react";
import { ActionButton } from "@/components/ui/ActionButton";
import { MindMapCanvas } from "./MindMapCanvas";
import type {
  AudioOverviewStatus,
  AudioScriptTurn,
} from "@/db/repo/audio";
import type { ArtifactKind } from "@/db/repo/artifacts";

export type ArtifactListItem = {
  id: string;
  type: ArtifactKind;
  status: "pending" | "ready" | "error";
  content: unknown;
  createdAt: string;
};

export type AudioOverviewItem = {
  id: string;
  status: AudioOverviewStatus;
  script: AudioScriptTurn[] | null;
  audioBlobUrl: string | null;
  durationS: number | null;
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

const AUDIO_STATUS_LABELS: Record<AudioOverviewStatus, string> = {
  queued: "Wartet",
  script: "Skript bereit",
  synthesizing: "Stimmen laufen",
  ready: "Audio bereit",
  error: "Fehler",
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

function renderArtifact(artifact: ArtifactListItem) {
  const content = asRecord(artifact.content);

  if (artifact.type === "faq") return renderFaq(content);
  if (artifact.type === "study_guide") return renderStudyGuide(content);
  if (artifact.type === "timeline") return renderTimeline(content);
  if (artifact.type === "briefing") return renderBriefing(content);
  if (artifact.type === "mindmap") {
    return <MindMapCanvas tree={artifact.content} />;
  }

  return (
    <pre className="overflow-auto text-xs">
      {JSON.stringify(artifact.content, null, 2)}
    </pre>
  );
}

function formatDuration(seconds: number | null) {
  if (!seconds) return null;
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

export function StudioPanel({
  notebookId,
  initialArtifacts,
  initialAudioOverview,
  readySourceCount,
  readOnly = false,
}: {
  notebookId: string;
  initialArtifacts: ArtifactListItem[];
  initialAudioOverview: AudioOverviewItem | null;
  readySourceCount: number;
  readOnly?: boolean;
}) {
  const [artifacts, setArtifacts] = useState(initialArtifacts ?? []);
  const [audioOverview, setAudioOverview] = useState(initialAudioOverview);
  const [busyType, setBusyType] = useState<ArtifactKind | null>(null);
  const [audioBusy, setAudioBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasReadySources = readySourceCount > 0;
  const audioCanBeRequested =
    hasReadySources &&
    !readOnly &&
    (!audioOverview || audioOverview.status === "error");
  const canGenerateAudio = audioCanBeRequested && !audioBusy;

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  async function handleGenerate(type: ArtifactKind) {
    if (!hasReadySources || readOnly || busyType) return;

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

  async function handleGenerateAudio() {
    if (!canGenerateAudio) return;

    setAudioBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/audio`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (json.audioOverview) {
        setAudioOverview(json.audioOverview);
      }
      if (!res.ok) {
        setError(json.error ?? "Audio Overview konnte nicht vorbereitet werden.");
      }
    } catch {
      setError("Keine Verbindung — bitte nochmal versuchen.");
    } finally {
      setAudioBusy(false);
    }
  }

  function speakScript(script: AudioScriptTurn[], index = 0) {
    if (index >= script.length) {
      setSpeaking(false);
      return;
    }

    const turn = script[index];
    const utterance = new SpeechSynthesisUtterance(turn.text);
    utterance.lang = "de-DE";

    const voices = window.speechSynthesis.getVoices();
    const voiceIndex = turn.speaker === "A" ? 0 : 1;
    utterance.voice = voices[voiceIndex] ?? voices[0] ?? null;
    utterance.onend = () => speakScript(script, index + 1);
    utterance.onerror = () => {
      setSpeaking(false);
      setError("Browser-Sprachausgabe wurde abgebrochen.");
    };
    window.speechSynthesis.speak(utterance);
  }

  function handleToggleSpeech() {
    if (speaking) {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setSpeaking(false);
      return;
    }

    const script = audioOverview?.script ?? [];
    if (script.length === 0) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setError("Browser-Sprachausgabe ist nicht verfügbar.");
      return;
    }

    setError(null);
    setSpeaking(true);
    speakScript(script);
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <section className="border-[1.5px] border-ink bg-paper p-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <p className="label-caps">Audio Overview</p>
          {audioOverview && (
            <span className="label-caps border-[1.5px] border-ink px-1.5 py-0.5 text-ink/70">
              {AUDIO_STATUS_LABELS[audioOverview.status]}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {audioCanBeRequested && (
            <ActionButton
              type="button"
              disabled={!canGenerateAudio}
              onClick={handleGenerateAudio}
            >
              {audioBusy ? "Skript läuft ..." : "Audio vorbereiten"}
            </ActionButton>
          )}

          {audioOverview?.script && audioOverview.script.length > 0 && (
            <ActionButton
              type="button"
              variant="outline"
              onClick={handleToggleSpeech}
            >
              {speaking ? "Stoppen" : "Vorlesen"}
            </ActionButton>
          )}

          {audioOverview?.audioBlobUrl && (
            <audio controls src={audioOverview.audioBlobUrl} className="w-full" />
          )}
        </div>

        {!hasReadySources && (
          <p className="mt-3 text-ink/60">
            Füge zuerst eine bereite Quelle hinzu.
          </p>
        )}

        {readOnly && (
          <p className="mt-3 text-ink/60">
            Demo-Dossier ist schreibgeschützt.
          </p>
        )}

        {audioOverview?.durationS && (
          <p className="label-caps mt-3 text-ink/60">
            Dauer ca. {formatDuration(audioOverview.durationS)}
          </p>
        )}

        {audioOverview?.script && audioOverview.script.length > 0 && (
          <ol className="mt-3 flex max-h-80 flex-col gap-2 overflow-y-auto border-t-[1.5px] border-ink pt-3">
            {audioOverview.script.map((turn, index) => (
              <li key={`${turn.speaker}-${index}`} className="leading-6">
                <span className="label-caps mr-2 border-[1.5px] border-ink px-1">
                  {turn.speaker}
                </span>
                {turn.text}
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        {Object.entries(ARTIFACT_LABELS).map(([type, label]) => (
          <ActionButton
            key={type}
            type="button"
            variant="outline"
            disabled={!hasReadySources || readOnly || Boolean(busyType)}
            onClick={() => handleGenerate(type as ArtifactKind)}
            className="min-h-10 px-2 text-left"
          >
            {busyType === type ? "Läuft ..." : label}
          </ActionButton>
        ))}
      </div>

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
