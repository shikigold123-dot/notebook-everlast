"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { ActionButton } from "@/components/ui/ActionButton";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { MindMapCanvas } from "./MindMapCanvas";
import type {
  AudioOverviewStatus,
  AudioScriptTurn,
} from "@/db/repo/audio";
import type { ArtifactKind } from "@/db/repo/artifacts";
import type { DetailLevel } from "@/lib/generation/customization";
import {
  buildBriefingPdf,
  buildPresentationPdf,
  downloadPdf,
  openPdf,
  slugifyFilename,
} from "@/lib/exports/pdf";
import { downloadDataTableXlsx } from "@/lib/exports/xlsx";

type GenerateType = "audio" | ArtifactKind;

type SourceScope = "all" | "selected";

type GenerateOptions = {
  detailLevel?: DetailLevel;
  customInstructions?: string;
  visualStyle?: string;
  speakerA?: string;
  speakerB?: string;
  sourceScope?: SourceScope;
};

const DETAIL_LEVEL_OPTIONS: { value: DetailLevel; label: string }[] = [
  { value: "brief", label: "Kurz" },
  { value: "standard", label: "Standard" },
  { value: "detailed", label: "Detailliert" },
];

const AUDIO_LENGTH_OPTIONS: { value: DetailLevel; label: string }[] = [
  { value: "brief", label: "Kurz · ~3 Min" },
  { value: "standard", label: "Standard · ~6 Min" },
  { value: "detailed", label: "Lang · ~12 Min" },
];

const VISUAL_STYLE_OPTIONS: { value: string; label: string }[] = [
  { value: "auto", label: "Automatisch" },
  { value: "minimal", label: "Minimalistisch" },
  { value: "sketchnote", label: "Sketchnote" },
  { value: "clay", label: "3D-Clay" },
  { value: "photo", label: "Fotorealistisch" },
  { value: "anime", label: "Anime" },
];

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
  briefing: "Bericht",
  mindmap: "Mind Map",
  video_overview: "Videoübersicht",
  presentation: "Präsentation",
  flashcards: "Karteikarten",
  quiz: "Quiz",
  infographic: "Infografik",
  website: "Landingpage",
  data_table: "Datentabelle",
  glossary: "Glossar",
};

const ARTIFACT_ICONS: Record<ArtifactKind, IconName> = {
  study_guide: "study",
  faq: "chat",
  timeline: "timeline",
  briefing: "briefing",
  mindmap: "mindmap",
  video_overview: "video",
  presentation: "file",
  flashcards: "study",
  quiz: "research",
  infographic: "spark",
  website: "website",
  data_table: "briefing",
  glossary: "text",
};


const AUDIO_STATUS_LABELS: Record<AudioOverviewStatus, string> = {
  queued: "Wartet",
  script: "Skript bereit",
  synthesizing: "Stimmen laufen",
  ready: "Podcast bereit",
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
          <li key={index} className="border-t border-line/50 pt-3">
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
          <section key={index} className="border-t border-line/50 pt-3">
            <h5 className="font-bold">{asString(row.heading)}</h5>
            {renderList(asArray(row.bullets))}
          </section>
        );
      })}
      {quiz.length > 0 && (
        <section className="border-t border-line/50 pt-3">
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
        <section className="border-t border-line/50 pt-3">
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
          <li key={index} className="relative border-l border-line pl-4">
            <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-paper bg-signal" />
            <p className="label-caps text-muted">{asString(row.date_label)}</p>
            <h4 className="font-bold">{asString(row.title)}</h4>
            <p className="mt-1 leading-6">{asString(row.description)}</p>
          </li>
        );
      })}
    </ol>
  );
}

function briefingInputFrom(content: JsonRecord) {
  return {
    summary: asString(content.summary) || undefined,
    keyPoints: asArray(content.key_points).map(asString).filter(Boolean),
    quotes: asArray(content.quotes).map(asString).filter(Boolean),
    openQuestions: asArray(content.open_questions).map(asString).filter(Boolean),
  };
}

function handleOpenBriefingPdf(content: JsonRecord) {
  const title = asString(content.title) || "Bericht";
  openPdf(buildBriefingPdf(title, briefingInputFrom(content)));
}

function handleDownloadBriefingPdf(content: JsonRecord) {
  const title = asString(content.title) || "Bericht";
  const filename = `${slugifyFilename(title, "bericht")}.pdf`;
  downloadPdf(buildBriefingPdf(title, briefingInputFrom(content)), filename);
}

function renderBriefing(content: JsonRecord) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end gap-2">
        <ActionButton
          type="button"
          variant="outline"
          className="min-h-9 px-3 py-2"
          onClick={() => handleOpenBriefingPdf(content)}
        >
          <Icon name="file" size={14} />
          Öffnen
        </ActionButton>
        <ActionButton
          type="button"
          variant="ghost"
          className="min-h-9 px-3 py-2"
          onClick={() => handleDownloadBriefingPdf(content)}
        >
          <Icon name="download" size={14} />
          PDF
        </ActionButton>
      </div>
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
          <section key={String(label)} className="border-t border-line/50 pt-3">
            <h4 className="label-caps">{String(label)}</h4>
            {renderList(rows)}
          </section>
        );
      })}
    </div>
  );
}

function renderVideoOverview(content: JsonRecord) {
  const scenes = asArray(content.scenes);
  return (
    <div className="flex flex-col gap-3">
      {asString(content.title) && (
        <h4 className="text-base font-bold">{asString(content.title)}</h4>
      )}
      {typeof content.duration_minutes === "number" && (
        <p className="label-caps text-muted">
          Ziel: ca. {content.duration_minutes} Minuten
        </p>
      )}
      <ol className="flex flex-col gap-3">
        {scenes.map((scene, index) => {
          const row = asRecord(scene);
          return (
            <li key={index} className="ki-soft rounded-md p-3">
              <p className="label-caps text-muted">
                {asString(row.timestamp) || `Szene ${index + 1}`}
              </p>
              <h5 className="mt-1 font-bold">{asString(row.headline)}</h5>
              <p className="mt-2 leading-6">{asString(row.narration)}</p>
              {asString(row.visual_prompt) && (
                <p className="mt-2 text-xs leading-5 text-muted">
                  Visual: {asString(row.visual_prompt)}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function presentationSlidesFrom(content: JsonRecord) {
  return asArray(content.slides).map((slide) => {
    const row = asRecord(slide);
    return {
      title: asString(row.title),
      subtitle: asString(row.subtitle) || undefined,
      bullets: asArray(row.bullets).map(asString).filter(Boolean),
      speakerNotes: asString(row.speaker_notes) || undefined,
    };
  });
}

function handleOpenPresentationPdf(content: JsonRecord) {
  const title = asString(content.title) || "Präsentation";
  openPdf(buildPresentationPdf(title, presentationSlidesFrom(content)));
}

function handleDownloadPresentationPdf(content: JsonRecord) {
  const title = asString(content.title) || "Präsentation";
  const filename = `${slugifyFilename(title, "praesentation")}.pdf`;
  downloadPdf(buildPresentationPdf(title, presentationSlidesFrom(content)), filename);
}

function renderPresentation(content: JsonRecord) {
  const slides = asArray(content.slides);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {asString(content.title) ? (
          <h4 className="text-base font-bold">{asString(content.title)}</h4>
        ) : (
          <span />
        )}
        <span className="flex flex-wrap gap-2">
          <ActionButton
            type="button"
            variant="outline"
            className="min-h-9 px-3 py-2"
            onClick={() => handleOpenPresentationPdf(content)}
          >
            <Icon name="file" size={14} />
            Öffnen
          </ActionButton>
          <ActionButton
            type="button"
            variant="ghost"
            className="min-h-9 px-3 py-2"
            onClick={() => handleDownloadPresentationPdf(content)}
          >
            <Icon name="download" size={14} />
            PDF
          </ActionButton>
        </span>
      </div>
      <ol className="flex flex-col gap-3">
        {slides.map((slide, index) => {
          const row = asRecord(slide);
          return (
            <li key={index} className="border-t border-line/50 pt-3">
              <p className="label-caps text-muted">Folie {index + 1}</p>
              <h5 className="mt-1 font-bold">{asString(row.title)}</h5>
              {asString(row.subtitle) && (
                <p className="mt-1 text-muted">{asString(row.subtitle)}</p>
              )}
              {renderList(asArray(row.bullets))}
              {asString(row.speaker_notes) && (
                <p className="mt-2 text-xs leading-5 text-muted">
                  Notiz: {asString(row.speaker_notes)}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

type FlashcardItem = { front: string; back: string; difficulty: string };

function flashcardsFrom(content: JsonRecord): FlashcardItem[] {
  return asArray(content.cards)
    .map((card) => {
      const row = asRecord(card);
      return {
        front: asString(row.front),
        back: asString(row.back),
        difficulty: asString(row.difficulty) || "mittel",
      };
    })
    .filter((card) => card.front || card.back);
}

function FlashcardsPlayer({ content }: { content: JsonRecord }) {
  const cards = useMemo(() => flashcardsFrom(content), [content]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());

  if (cards.length === 0) {
    return <p className="text-sm text-muted">Keine Karteikarten verfügbar.</p>;
  }

  const card = cards[index];
  const isLast = index === cards.length - 1;

  function goTo(nextIndex: number) {
    setIndex(Math.max(0, Math.min(cards.length - 1, nextIndex)));
    setFlipped(false);
  }

  function markKnown(isKnown: boolean) {
    setKnown((prev) => {
      const next = new Set(prev);
      if (isKnown) next.add(index);
      else next.delete(index);
      return next;
    });
    if (!isLast) goTo(index + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="label-caps text-muted">
          Karte {index + 1} / {cards.length}
        </span>
        <span className="label-caps text-muted">{known.size} gewusst</span>
      </div>

      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? "Antwort, zum Umdrehen klicken" : "Frage, zum Umdrehen klicken"}
        className="ki-raised ki-interactive flex min-h-52 w-full cursor-pointer flex-col items-center justify-center gap-3 p-6 text-center"
      >
        <span className="label-caps text-muted">
          {flipped ? "Antwort" : "Frage"} · {card.difficulty}
        </span>
        <span className="text-lg font-semibold leading-snug">
          {flipped ? card.back : card.front}
        </span>
        <span className="label-caps text-muted/70">Zum Umdrehen klicken</span>
      </button>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          className="ki-pill ki-interactive cursor-pointer px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        >
          Zurück
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => markKnown(false)}
            className="ki-pill ki-interactive cursor-pointer px-3 py-1.5 text-xs font-semibold text-danger"
          >
            Nochmal
          </button>
          <button
            type="button"
            onClick={() => markKnown(true)}
            className="ki-cta cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold"
          >
            Weiß ich
          </button>
        </div>
        <button
          type="button"
          onClick={() => goTo(index + 1)}
          disabled={isLast}
          className="ki-pill ki-interactive cursor-pointer px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        >
          Weiter
        </button>
      </div>
    </div>
  );
}

type QuizQuestionItem = {
  question: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
};

function quizQuestionsFrom(content: JsonRecord): QuizQuestionItem[] {
  return asArray(content.questions)
    .map((question) => {
      const row = asRecord(question);
      return {
        question: asString(row.question),
        choices: asArray(row.choices).map(asString),
        answerIndex:
          typeof row.answer_index === "number" ? row.answer_index : -1,
        explanation: asString(row.explanation),
      };
    })
    .filter((question) => question.question && question.choices.length > 0);
}

function QuizPlayer({ content }: { content: JsonRecord }) {
  const questions = useMemo(() => quizQuestionsFrom(content), [content]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  if (questions.length === 0) {
    return <p className="text-sm text-muted">Keine Quizfragen verfügbar.</p>;
  }

  if (finished) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <span className="ki-tile h-14 w-14">
          <Icon name="check" size={22} />
        </span>
        <p className="text-xl font-semibold">
          {score} von {questions.length} richtig
        </p>
        <ActionButton
          type="button"
          onClick={() => {
            setIndex(0);
            setSelected(null);
            setScore(0);
            setFinished(false);
          }}
        >
          Neu starten
        </ActionButton>
      </div>
    );
  }

  const question = questions[index];
  const isAnswered = selected !== null;
  const isCorrectSelected = selected === question.answerIndex;
  const isLastQuestion = index + 1 >= questions.length;

  function selectChoice(choiceIndex: number) {
    if (isAnswered) return;
    setSelected(choiceIndex);
    if (choiceIndex === question.answerIndex) setScore((s) => s + 1);
  }

  function next() {
    if (isLastQuestion) {
      setFinished(true);
      return;
    }
    setIndex((i) => i + 1);
    setSelected(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="label-caps text-muted">
          Frage {index + 1} / {questions.length}
        </span>
        <span className="label-caps text-muted">{score} richtig</span>
      </div>

      <h5 className="text-base font-semibold leading-snug">{question.question}</h5>

      <ol className="flex flex-col gap-2">
        {question.choices.map((choice, choiceIndex) => {
          const isSelected = selected === choiceIndex;
          const isRight = choiceIndex === question.answerIndex;
          let stateClass = "border-line hover:bg-panel-soft";
          if (isAnswered && isRight) {
            stateClass = "border-signal bg-signal/15";
          } else if (isAnswered && isSelected && !isRight) {
            stateClass = "border-danger bg-danger/10";
          }
          return (
            <li key={choiceIndex}>
              <button
                type="button"
                onClick={() => selectChoice(choiceIndex)}
                disabled={isAnswered}
                aria-label={`Antwort ${String.fromCharCode(65 + choiceIndex)}: ${choice}`}
                className={`ki-interactive flex w-full cursor-pointer items-center gap-3 rounded-md border-[1.5px] p-3 text-left text-sm disabled:cursor-default ${stateClass}`}
              >
                <span className="ki-tile h-7 w-7 shrink-0 text-xs font-semibold">
                  {String.fromCharCode(65 + choiceIndex)}
                </span>
                <span className="flex-1">{choice}</span>
                {isAnswered && isRight && (
                  <Icon name="check" size={16} className="shrink-0 text-ink" />
                )}
                {isAnswered && isSelected && !isRight && (
                  <Icon name="x" size={16} className="shrink-0 text-danger" />
                )}
              </button>
            </li>
          );
        })}
      </ol>

      {isAnswered && (
        <div className="ki-soft flex flex-col gap-1 p-3 text-sm">
          <span
            className={`label-caps ${isCorrectSelected ? "text-ink" : "text-danger"}`}
          >
            {isCorrectSelected ? "Richtig!" : "Nicht ganz."}
          </span>
          {question.explanation && (
            <p className="leading-6 text-muted">{question.explanation}</p>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <ActionButton type="button" disabled={!isAnswered} onClick={next}>
          {isLastQuestion ? "Ergebnis anzeigen" : "Weiter"}
        </ActionButton>
      </div>
    </div>
  );
}

function renderInfographic(content: JsonRecord) {
  const imageUrl = asString(content.imageUrl);
  const sections = asArray(content.sections);
  if (imageUrl) {
    return (
      <div className="flex flex-col gap-3">
        {asString(content.title) && (
          <h4 className="text-base font-bold">{asString(content.title)}</h4>
        )}
        <div className="overflow-hidden rounded-lg border-[1.5px] border-line bg-panel-soft">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={asString(content.title) || "Generierte Infografik"}
            className="h-auto w-full"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {asString(content.title) && (
        <h4 className="text-base font-bold">{asString(content.title)}</h4>
      )}
      {asString(content.layout) && (
        <p className="label-caps text-muted">Layout: {asString(content.layout)}</p>
      )}
      <div className="grid grid-cols-1 gap-3">
        {sections.map((section, index) => {
          const row = asRecord(section);
          return (
            <section key={index} className="ki-soft rounded-md p-3">
              <p className="label-caps text-muted">{asString(row.label)}</p>
              {asString(row.metric) && (
                <p className="mt-2 text-2xl font-semibold">
                  {asString(row.metric)}
                </p>
              )}
              <p className="mt-2 leading-6">{asString(row.description)}</p>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function websiteFilename(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "everlast-website"}.html`;
}

function createWebsiteBlobUrl(html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  return URL.createObjectURL(blob);
}

function openWebsitePreview(html: string) {
  if (typeof window === "undefined") return;
  const url = createWebsiteBlobUrl(html);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function downloadWebsiteHtml(html: string, title: string) {
  if (typeof document === "undefined") return;
  const url = createWebsiteBlobUrl(html);
  const link = document.createElement("a");
  link.href = url;
  link.download = websiteFilename(title);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderWebsite(content: JsonRecord) {
  const html = asString(content.html);
  const title = asString(content.title) || "Landingpage";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-base font-bold">{title}</h4>
        {html && (
          <span className="flex flex-wrap gap-2">
            <ActionButton
              type="button"
              variant="outline"
              className="min-h-9 px-3 py-2"
              onClick={() => openWebsitePreview(html)}
            >
              <Icon name="website" size={14} />
              Öffnen
            </ActionButton>
            <ActionButton
              type="button"
              variant="ghost"
              className="min-h-9 px-3 py-2"
              onClick={() => downloadWebsiteHtml(html, title)}
            >
              <Icon name="file" size={14} />
              HTML
            </ActionButton>
          </span>
        )}
      </div>
      {html ? (
        <div className="overflow-hidden rounded-lg border-[1.5px] border-line bg-white">
          <iframe
            title={title}
            srcDoc={html}
            sandbox=""
            className="h-[520px] w-full bg-white"
          />
        </div>
      ) : (
        <p className="text-muted">Landingpage konnte nicht dargestellt werden.</p>
      )}
    </div>
  );
}

function dataTableFrom(content: JsonRecord) {
  const columns = asArray(content.columns).map(asString).filter(Boolean);
  const rows = asArray(content.rows).map((row) => asArray(row).map(asString));
  return { columns, rows };
}

function handleDownloadDataTableXlsx(content: JsonRecord) {
  const title = asString(content.title) || "Datentabelle";
  const { columns, rows } = dataTableFrom(content);
  downloadDataTableXlsx(title, columns, rows);
}

function renderDataTable(content: JsonRecord) {
  const { columns, rows } = dataTableFrom(content);
  const title = asString(content.title);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {title && <h4 className="text-base font-bold">{title}</h4>}
          <p className="label-caps mt-0.5 text-muted">
            {rows.length} {rows.length === 1 ? "Zeile" : "Zeilen"} · {columns.length}{" "}
            {columns.length === 1 ? "Spalte" : "Spalten"}
          </p>
        </div>
        {columns.length > 0 && (
          <ActionButton
            type="button"
            variant="ghost"
            className="min-h-9 px-3 py-2"
            onClick={() => handleDownloadDataTableXlsx(content)}
          >
            <Icon name="download" size={14} />
            Excel
          </ActionButton>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border-[1.5px] border-line shadow-card">
        <table className="w-full min-w-[420px] border-collapse text-left text-xs">
          <thead>
            <tr className="bg-panel-soft">
              {columns.map((column, index) => (
                <th
                  key={`${column}-${index}`}
                  className="sticky top-0 whitespace-nowrap border-b-[1.5px] border-line bg-panel-soft px-3.5 py-2.5 font-bold text-ink"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={`transition-colors hover:bg-signal/10 ${
                  rowIndex % 2 === 1 ? "bg-panel/40" : "bg-paper"
                }`}
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="border-b border-line/50 px-3.5 py-2.5 align-top leading-5"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {renderList(asArray(content.notes))}
    </div>
  );
}

function renderGlossary(content: JsonRecord) {
  const terms = asArray(content.terms);
  return (
    <dl className="flex flex-col gap-3">
      {terms.map((term, index) => {
        const row = asRecord(term);
        return (
          <div key={index} className="border-t border-line/50 pt-3">
            <dt className="font-bold">{asString(row.term)}</dt>
            <dd className="mt-1 leading-6">{asString(row.definition)}</dd>
            {asString(row.context) && (
              <dd className="mt-1 text-xs leading-5 text-muted">
                Kontext: {asString(row.context)}
              </dd>
            )}
          </div>
        );
      })}
    </dl>
  );
}

function renderArtifact(artifact: ArtifactListItem) {
  const content = asRecord(artifact.content);

  if (artifact.status === "error") {
    return (
      <p className="flex items-start gap-2.5 rounded-sm border-[1.5px] border-line bg-paper px-3 py-2.5 leading-6 text-danger">
        <Icon name="alert" size={16} className="mt-1 shrink-0" />
        {asString(content.message) || "Dieser Output konnte nicht erstellt werden."}
      </p>
    );
  }

  if (artifact.type === "faq") return renderFaq(content);
  if (artifact.type === "study_guide") return renderStudyGuide(content);
  if (artifact.type === "timeline") return renderTimeline(content);
  if (artifact.type === "briefing") return renderBriefing(content);
  if (artifact.type === "mindmap") {
    return <MindMapCanvas tree={artifact.content} />;
  }
  if (artifact.type === "video_overview") return renderVideoOverview(content);
  if (artifact.type === "presentation") return renderPresentation(content);
  if (artifact.type === "flashcards") return <FlashcardsPlayer content={content} />;
  if (artifact.type === "quiz") return <QuizPlayer content={content} />;
  if (artifact.type === "infographic") return renderInfographic(content);
  if (artifact.type === "website") return renderWebsite(content);
  if (artifact.type === "data_table") return renderDataTable(content);
  if (artifact.type === "glossary") return renderGlossary(content);

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
  initialArtifacts = [],
  initialAudioOverviews = [],
  readySourceCount,
  readOnly = false,
  selectedSourceIds,
  selectedNoteIds,
  notebookTitle = "Notebook",
}: {
  notebookId: string;
  initialArtifacts?: ArtifactListItem[];
  initialAudioOverviews?: AudioOverviewItem[];
  readySourceCount: number;
  readOnly?: boolean;
  selectedSourceIds?: string[];
  selectedNoteIds?: string[];
  notebookTitle?: string;
}) {
  const [artifacts, setArtifacts] = useState<ArtifactListItem[]>(initialArtifacts);
  const [audioOverviews, setAudioOverviews] = useState<AudioOverviewItem[]>(initialAudioOverviews);
  const [busyType, setBusyType] = useState<ArtifactKind | "audio" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ArtifactListItem | AudioOverviewItem | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const [customizeType, setCustomizeType] = useState<GenerateType | null>(null);
  const [detailLevel, setDetailLevel] = useState<DetailLevel>("standard");
  const [customInstructions, setCustomInstructions] = useState("");
  const [visualStyle, setVisualStyle] = useState("auto");
  const [speakerA, setSpeakerA] = useState("");
  const [speakerB, setSpeakerB] = useState("");
  const [sourceScope, setSourceScope] = useState<SourceScope>("selected");

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const handlePause = () => setPlayingId(null);
    const handleEnded = () => setPlayingId(null);

    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  const hasReadySources = readySourceCount > 0 || (selectedNoteIds?.length ?? 0) > 0;
  const isAudioBusy = audioOverviews.some(
    (a) => a.status === "queued" || a.status === "synthesizing"
  );
  const canGenerateAudio = hasReadySources && !readOnly && !isAudioBusy && !busyType;

  async function handleGenerate(type: ArtifactKind, options: GenerateOptions = {}) {
    if (!hasReadySources || readOnly || busyType) return;

    setBusyType(type);
    setError(null);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/artifacts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          ...(options.sourceScope !== "all" && selectedSourceIds !== undefined
            ? { sourceIds: selectedSourceIds }
            : {}),
          ...(selectedNoteIds !== undefined ? { noteIds: selectedNoteIds } : {}),
          ...(options.detailLevel && options.detailLevel !== "standard"
            ? { detailLevel: options.detailLevel }
            : {}),
          ...(options.customInstructions?.trim()
            ? { customInstructions: options.customInstructions.trim() }
            : {}),
          ...(type === "infographic" && options.visualStyle && options.visualStyle !== "auto"
            ? { visualStyle: options.visualStyle }
            : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.artifact) {
        setArtifacts((prev) => [...prev, json.artifact]);
      }
      if (!res.ok) {
        setError(json.error ?? "Artefakt konnte nicht generiert werden.");
        return;
      }
    } catch {
      setError("Keine Verbindung — bitte nochmal versuchen.");
    } finally {
      setBusyType(null);
    }
  }

  async function handleGenerateAudio(options: GenerateOptions = {}) {
    if (!canGenerateAudio) return;

    setBusyType("audio");
    setError(null);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/audio`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(options.sourceScope !== "all" && selectedSourceIds !== undefined
            ? { sourceIds: selectedSourceIds }
            : {}),
          ...(selectedNoteIds !== undefined ? { noteIds: selectedNoteIds } : {}),
          ...(options.detailLevel && options.detailLevel !== "standard"
            ? { detailLevel: options.detailLevel }
            : {}),
          ...(options.customInstructions?.trim()
            ? { customInstructions: options.customInstructions.trim() }
            : {}),
          ...(options.speakerA?.trim() ? { speakerA: options.speakerA.trim() } : {}),
          ...(options.speakerB?.trim() ? { speakerB: options.speakerB.trim() } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.audioOverview) {
        setAudioOverviews((prev) => {
          const filtered = prev.filter((a) => a.id !== json.audioOverview.id);
          return [json.audioOverview, ...filtered];
        });
      }
      if (!res.ok) {
        setError(json.error ?? "Audio Overview konnte nicht vorbereitet werden.");
      }
    } catch {
      setError("Keine Verbindung — bitte nochmal versuchen.");
    } finally {
      setBusyType(null);
    }
  }

  async function handleDelete(item: { id: string; type: "audio" | ArtifactKind }, e: React.MouseEvent) {
    e.stopPropagation();
    if (readOnly) {
      setError("Demo-Notebook ist schreibgeschützt.");
      return;
    }
    if (!window.confirm("Möchtest du dieses Element wirklich löschen?")) return;

    setActiveMenuId(null);
    try {
      const url = item.type === "audio"
        ? `/api/notebooks/${notebookId}/audio/${item.id}`
        : `/api/notebooks/${notebookId}/artifacts/${item.id}`;

      const res = await fetch(url, { method: "DELETE" });
      if (res.ok) {
        if (item.type === "audio") {
          if (playingId === item.id && audioRef.current) {
            audioRef.current.pause();
            setPlayingId(null);
          }
          setAudioOverviews((prev) => prev.filter((a) => a.id !== item.id));
        } else {
          setArtifacts((prev) => prev.filter((a) => a.id !== item.id));
        }
        if (selectedItem?.id === item.id) {
          setSelectedItem(null);
        }
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Löschen fehlgeschlagen.");
      }
    } catch {
      setError("Keine Verbindung — bitte nochmal versuchen.");
    }
  }

  const togglePlay = (item: AudioOverviewItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current || !item.audioBlobUrl) return;

    if (playingId === item.id) {
      audioRef.current.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current.src !== item.audioBlobUrl) {
        audioRef.current.src = item.audioBlobUrl;
      }
      audioRef.current.play().then(() => {
        setPlayingId(item.id);
      }).catch((err) => {
        console.error("Audio play failed:", err);
        setError("Audio-Wiedergabe fehlgeschlagen.");
      });
    }
  };

  function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Gerade eben";
    if (diffMins < 60) return `Vor ${diffMins} Min.`;
    if (diffHours < 24) return `Vor ${diffHours} Std.`;
    if (diffDays === 1) return "Vor 1 Tag";
    return `Vor ${diffDays} Tagen`;
  }

  const GRID_ACTIONS: {
    type: "audio" | ArtifactKind;
    label: string;
    icon: IconName;
    swatch: string;
  }[] = [
    { type: "audio", label: "Audio", icon: "headphones", swatch: "#7c6fea" },
    { type: "presentation", label: "Präsentation", icon: "file", swatch: "#cf8a3d" },
    { type: "website", label: "Landingpage", icon: "website", swatch: "#2fa89a" },
    { type: "mindmap", label: "Mindmap", icon: "mindmap", swatch: "#c464c9" },
    { type: "briefing", label: "Bericht", icon: "briefing", swatch: "#d6b23a" },
    { type: "flashcards", label: "Karteikarten", icon: "study", swatch: "#e07a4f" },
    { type: "quiz", label: "Quiz", icon: "research", swatch: "#4f8fe0" },
    { type: "infographic", label: "Infografik", icon: "spark", swatch: "#d65a7a" },
    { type: "data_table", label: "Datentabelle", icon: "briefing", swatch: "#4fae7a" },
  ];

  const feedItems = [
    ...artifacts.map((a) => ({
      id: a.id,
      type: a.type as "audio" | ArtifactKind,
      status: a.status,
      createdAt: a.createdAt,
      rawItem: a,
    })),
    ...audioOverviews.map((a) => ({
      id: a.id,
      type: "audio" as const,
      status: a.status,
      createdAt: a.createdAt,
      rawItem: a,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Close active dropdown menu when clicking anywhere else
  useEffect(() => {
    if (!activeMenuId) return;
    const handleOutsideClick = () => setActiveMenuId(null);
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [activeMenuId]);

  return (
    <div className="flex h-full flex-col gap-4">
      {!hasReadySources && (
        <p className="ki-soft px-4 py-3 text-xs leading-5 text-muted">
          Wähle zuerst eine bereite Quelle oder Notiz aus, um Generierungen zu starten.
        </p>
      )}
      {readOnly && (
        <p className="ki-soft px-4 py-3 text-xs leading-5 text-muted">
          Dieses Demo-Notebook ist schreibgeschützt. Du kannst keine neuen Outputs generieren.
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 min-[460px]:grid-cols-2">
        {GRID_ACTIONS.map((action) => {
          const isGenerating = busyType === action.type;
          const isDisabled =
            action.type === "audio"
              ? !canGenerateAudio
              : !hasReadySources || readOnly || Boolean(busyType);

          return (
            <button
              key={action.type}
              type="button"
              disabled={isDisabled}
              onClick={() => {
                setDetailLevel("standard");
                setCustomInstructions("");
                setVisualStyle("auto");
                setSpeakerA("");
                setSpeakerB("");
                setSourceScope("selected");
                setCustomizeType(action.type);
              }}
              style={{ "--swatch": action.swatch } as React.CSSProperties}
              className="ki-swatch ki-interactive group grid min-h-16 w-full cursor-pointer grid-cols-[2.25rem_minmax(0,1fr)_1rem] items-center gap-2 px-2.5 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span className="ki-swatch-icon grid h-9 w-9 place-items-center rounded-[0.65rem]">
                <Icon name={action.icon} size={16} />
              </span>
              <span className="min-w-0 text-[13px] font-semibold leading-tight">
                {isGenerating ? "Wird erstellt …" : action.label}
              </span>
              <span className="grid place-items-center text-muted transition-transform duration-200 group-hover:translate-x-0.5">
                {isGenerating ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
                ) : (
                  <Icon name="chevronRight" size={13} />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <hr className="my-1 border-line/50" />

      {error && (
        <p
          className="flex items-center gap-2.5 rounded-sm border-[1.5px] border-line bg-paper px-4 py-3 text-sm text-danger"
          role="alert"
        >
          <Icon name="alert" size={16} className="shrink-0" />
          {error}
        </p>
      )}

      {/* Unified Feed of Generated Items */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {feedItems.length === 0 ? (
          <p className="ki-raised px-4 py-5 text-sm leading-6 text-muted">
            Noch keine Outputs generiert.
          </p>
        ) : (
          <ol className="flex flex-col">
            {feedItems.map((item) => {
              const isAudio = item.type === "audio";
              const isReady = item.status === "ready";
              const formattedTime = formatRelativeTime(item.createdAt);

              const title = notebookTitle || "Notebook";
              let subtitle = "";

              if (isAudio) {
                if (isReady) {
                  const duration = formatDuration((item.rawItem as AudioOverviewItem).durationS);
                  subtitle = `${duration ? duration + " · " : ""}Diskussion · ${readySourceCount + (selectedNoteIds?.length ?? 0)} Kontexte · ${formattedTime}`;
                } else if (item.status === "error") {
                  subtitle = "Generierungsfehler";
                } else {
                  subtitle = AUDIO_STATUS_LABELS[item.status as AudioOverviewStatus] + "...";
                }
              } else {
                if (isReady) {
                  subtitle = `${ARTIFACT_LABELS[item.type as ArtifactKind]} · ${readySourceCount + (selectedNoteIds?.length ?? 0)} Kontexte · ${formattedTime}`;
                } else if (item.status === "error") {
                  subtitle = "Fehler bei Generierung";
                } else {
                  subtitle = "Generierung läuft...";
                }
              }

              const isClickable = isReady || (isAudio && (item.status === "script" || item.status === "synthesizing"));

              return (
                <li
                  key={item.id}
                  onClick={() => {
                    if (isClickable) setSelectedItem(item.rawItem);
                  }}
                  className={`relative flex cursor-pointer items-center justify-between border-b border-line/45 p-3 transition-colors duration-150 last:border-b-0 hover:bg-panel-soft/70 ${
                    !isClickable ? "pointer-events-none opacity-60" : ""
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3 pr-3">
                    <span className="ki-tile h-10 w-10 shrink-0">
                      <Icon
                        name={item.type === "audio" ? "headphones" : ARTIFACT_ICONS[item.type]}
                        size={16}
                      />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold leading-5">{title}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {/* Audio Play/Pause Button */}
                    {isAudio && isReady && (
                      <button
                        type="button"
                        onClick={(e) => togglePlay(item.rawItem as AudioOverviewItem, e)}
                        className="grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-signal text-signal-ink shadow-glow transition-transform hover:scale-105"
                        aria-label={playingId === item.id ? "Pause" : "Play"}
                      >
                        <Icon
                          name={playingId === item.id ? "pause" : "play"}
                          size={14}
                        />
                      </button>
                    )}

                    {/* Options Button */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(activeMenuId === item.id ? null : item.id);
                        }}
                        className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-panel-soft hover:text-ink"
                        aria-label="Optionen"
                        aria-expanded={activeMenuId === item.id}
                      >
                        <Icon name="more" size={16} />
                      </button>

                      {activeMenuId === item.id && (
                        <div
                          className="ki-menu ki-enter absolute right-0 top-10 z-10 w-44 py-1 text-xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isAudio && (item.rawItem as AudioOverviewItem).audioBlobUrl && (
                            <a
                              href={(item.rawItem as AudioOverviewItem).audioBlobUrl || ""}
                              download={`podcast-${notebookId}.mp3`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2 px-3 py-2.5 font-semibold transition-colors hover:bg-panel-soft"
                              onClick={() => setActiveMenuId(null)}
                            >
                              <Icon name="download" size={14} />
                              Herunterladen
                            </a>
                          )}
                          <button
                            type="button"
                            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left font-semibold text-danger transition-colors hover:bg-panel-soft"
                            onClick={(e) => handleDelete(item, e)}
                          >
                            <Icon name="trash" size={14} />
                            Löschen
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Details Preview Modal Dialog */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-xs"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="ki-panel ki-enter relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden bg-paper shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex min-h-16 items-center justify-between gap-3 border-b border-line/50 bg-panel/80 px-5 py-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-signal text-signal-ink">
                  <Icon
                    name={"type" in selectedItem ? ARTIFACT_ICONS[selectedItem.type] : "headphones"}
                    size={15}
                  />
                </span>
                <h3 className="text-lg font-bold tracking-tight">
                  {"type" in selectedItem
                    ? ARTIFACT_LABELS[selectedItem.type]
                    : "Audio-Podcast"}
                </h3>
              </div>
              <button
                type="button"
                className="ki-tile ki-interactive h-10 w-10 cursor-pointer"
                onClick={() => setSelectedItem(null)}
                aria-label="Schließen"
              >
                <Icon name="x" size={17} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {"type" in selectedItem ? (
                renderArtifact(selectedItem)
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="ki-soft p-4">
                    <p className="label-caps mb-3 text-muted">Podcast-Player</p>
                    {selectedItem.audioBlobUrl ? (
                      <audio controls src={selectedItem.audioBlobUrl} className="w-full" />
                    ) : (
                      <p className="text-sm text-muted">
                        {AUDIO_STATUS_LABELS[selectedItem.status]}
                      </p>
                    )}
                  </div>
                  {selectedItem.script && selectedItem.script.length > 0 && (
                    <div className="space-y-3">
                      <p className="label-caps border-b border-line/50 pb-2 text-muted">
                        Dialog-Skript
                      </p>
                      <ol className="flex max-h-[40vh] flex-col gap-3 overflow-y-auto pr-1">
                        {selectedItem.script.map((turn, index) => (
                          <li key={`${turn.speaker}-${index}`} className="text-sm leading-6">
                            <span className="label-caps ki-pill mr-2 px-2 py-0.5">
                              Sprecher {turn.speaker}
                            </span>
                            {turn.text}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Anpassen-Modal: Detailgrad, Freitext und typspezifische Felder vor der Generierung */}
      {customizeType && (() => {
        const action = GRID_ACTIONS.find((item) => item.type === customizeType);
        if (!action) return null;
        const isAudio = customizeType === "audio";
        const lengthOptions = isAudio ? AUDIO_LENGTH_OPTIONS : DETAIL_LEVEL_OPTIONS;

        const totalContextCount = readySourceCount + (selectedNoteIds?.length ?? 0);
        const selectedContextCount =
          (selectedSourceIds?.length ?? readySourceCount) + (selectedNoteIds?.length ?? 0);
        const scopeChoiceMatters = selectedContextCount !== totalContextCount;

        function submit() {
          const type = customizeType!;
          setCustomizeType(null);
          if (type === "audio") {
            handleGenerateAudio({
              detailLevel,
              customInstructions,
              speakerA,
              speakerB,
              sourceScope,
            });
          } else {
            handleGenerate(type, {
              detailLevel,
              customInstructions,
              visualStyle,
              sourceScope,
            });
          }
        }

        return (
          <Modal
            isOpen
            onClose={() => setCustomizeType(null)}
            title={`${action.label} anpassen`}
          >
            <div className="flex flex-col gap-5">
              {scopeChoiceMatters && (
                <div>
                  <p className="label-caps mb-2 text-muted">Quellen-Umfang</p>
                  <div className="ki-pill inline-flex gap-1 p-1">
                    <button
                      type="button"
                      onClick={() => setSourceScope("selected")}
                      className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        sourceScope === "selected"
                          ? "bg-signal text-signal-ink"
                          : "text-ink/70 hover:bg-panel-soft"
                      }`}
                    >
                      Nur ausgewählte ({selectedContextCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSourceScope("all")}
                      className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        sourceScope === "all"
                          ? "bg-signal text-signal-ink"
                          : "text-ink/70 hover:bg-panel-soft"
                      }`}
                    >
                      Alle Quellen ({totalContextCount})
                    </button>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted">
                    Ein einziger Output wird aus allen Quellen im gewählten Umfang
                    zusammen erstellt — nicht mehrere getrennte.
                  </p>
                </div>
              )}

              <div>
                <p className="label-caps mb-2 text-muted">
                  {isAudio ? "Länge" : "Detailgrad"}
                </p>
                <div className="ki-pill inline-flex gap-1 p-1">
                  {lengthOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDetailLevel(opt.value)}
                      className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        detailLevel === opt.value
                          ? "bg-signal text-signal-ink"
                          : "text-ink/70 hover:bg-panel-soft"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {customizeType === "infographic" && (
                <div>
                  <p className="label-caps mb-2 text-muted">Visueller Stil</p>
                  <div className="flex flex-wrap gap-2">
                    {VISUAL_STYLE_OPTIONS.map((style) => (
                      <button
                        key={style.value}
                        type="button"
                        onClick={() => setVisualStyle(style.value)}
                        className={`ki-pill cursor-pointer px-3 py-1.5 text-xs font-semibold transition-colors ${
                          visualStyle === style.value
                            ? "border-signal bg-signal/15 text-ink"
                            : "text-ink/70 hover:bg-panel-soft"
                        }`}
                      >
                        {style.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isAudio && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="label-caps text-muted">Sprecher A</span>
                    <input
                      value={speakerA}
                      onChange={(e) => setSpeakerA(e.target.value)}
                      placeholder="z. B. souveräne Moderatorin"
                      maxLength={80}
                      className="ki-soft rounded-md px-3 py-2 text-sm outline-none transition-colors focus:border-signal"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="label-caps text-muted">Sprecher B</span>
                    <input
                      value={speakerB}
                      onChange={(e) => setSpeakerB(e.target.value)}
                      placeholder="z. B. erklärender Experte"
                      maxLength={80}
                      className="ki-soft rounded-md px-3 py-2 text-sm outline-none transition-colors focus:border-signal"
                    />
                  </label>
                </div>
              )}

              <label className="flex flex-col gap-1.5 text-sm">
                <span className="label-caps text-muted">
                  {isAudio ? "Worum soll es gehen? (optional)" : "Zusätzliche Anweisungen (optional)"}
                </span>
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  maxLength={400}
                  rows={3}
                  placeholder={
                    isAudio
                      ? "z. B. Fokus auf Kapitel 2, lockerer Ton"
                      : 'z. B. "Verwende ein blaues Farbschema und hebe die drei wichtigsten Punkte hervor."'
                  }
                  className="ki-soft resize-y rounded-md px-3 py-2.5 text-sm leading-6 outline-none transition-colors focus:border-signal"
                />
              </label>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCustomizeType(null)}
                  className="ki-pill ki-interactive cursor-pointer px-4 py-2 text-sm font-semibold text-ink"
                >
                  Abbrechen
                </button>
                <ActionButton type="button" onClick={submit}>
                  Erstellen
                </ActionButton>
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
