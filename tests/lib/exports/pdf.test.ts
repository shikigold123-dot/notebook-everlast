import { describe, it, expect } from "vitest";
import {
  buildBriefingPdf,
  buildPresentationPdf,
  slugifyFilename,
} from "@/lib/exports/pdf";

describe("slugifyFilename", () => {
  it("erzeugt einen URL-sicheren Slug aus dem Titel", () => {
    expect(slugifyFilename("KI-Wettlauf 2026: Strategien!", "fallback")).toBe(
      "ki-wettlauf-2026-strategien"
    );
  });

  it("nutzt den Fallback bei leerem Titel", () => {
    expect(slugifyFilename("   ", "bericht")).toBe("bericht");
  });
});

describe("buildPresentationPdf", () => {
  it("erzeugt eine Titelfolie plus eine Seite pro Folie", () => {
    const doc = buildPresentationPdf("Meine Präsentation", [
      { title: "Folie 1", bullets: ["Punkt A", "Punkt B"] },
      { title: "Folie 2", subtitle: "Untertitel", speakerNotes: "Notiz" },
    ]);

    expect(doc.getNumberOfPages()).toBe(3);
  });

  it("erzeugt auch ohne Folien nur die Titelseite und ein gültiges PDF", () => {
    const doc = buildPresentationPdf("Leer", []);
    expect(doc.getNumberOfPages()).toBe(1);
    const blob = doc.output("blob");
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe("buildBriefingPdf", () => {
  it("erzeugt ein Deckblatt plus mindestens eine Inhaltsseite", () => {
    const doc = buildBriefingPdf("Mein Bericht", {
      summary: "Kurze Zusammenfassung.",
      keyPoints: ["Punkt 1", "Punkt 2"],
      quotes: ["Ein Zitat."],
      openQuestions: ["Was noch?"],
    });

    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    const blob = doc.output("blob");
    expect(blob.size).toBeGreaterThan(0);
  });

  it("erzeugt ein gültiges PDF auch ohne Inhalte", () => {
    const doc = buildBriefingPdf("Leerer Bericht", {});
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
  });
});
