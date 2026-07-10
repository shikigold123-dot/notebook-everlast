import { jsPDF } from "jspdf";

// Everlast-Markenfarben als RGB-Tripel (funktioniert über alle jsPDF-Versionen
// hinweg zuverlässig, anders als Hex-Strings).
const INK: [number, number, number] = [12, 17, 8];
const MUTED: [number, number, number] = [72, 81, 67];
const SIGNAL: [number, number, number] = [212, 255, 66];
const PAPER: [number, number, number] = [252, 253, 248];
const LINE: [number, number, number] = [205, 216, 190];

const DATE_FORMAT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function slugifyFilename(title: string, fallback: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || fallback;
}

export function downloadPdf(doc: jsPDF, filename: string) {
  doc.save(filename);
}

export function openPdf(doc: jsPDF) {
  const url = doc.output("bloburl");
  window.open(url.toString(), "_blank", "noopener,noreferrer");
}

export type PresentationSlideInput = {
  title: string;
  subtitle?: string;
  bullets?: string[];
  speakerNotes?: string;
};

const SLIDE_W = 960;
const SLIDE_H = 540;
const SLIDE_MARGIN = 64;

function paintSlideBackground(doc: jsPDF) {
  doc.setFillColor(...PAPER);
  doc.rect(0, 0, SLIDE_W, SLIDE_H, "F");
  doc.setFillColor(...SIGNAL);
  doc.rect(0, 0, SLIDE_W, 8, "F");
}

export function buildPresentationPdf(
  title: string,
  slides: PresentationSlideInput[]
): jsPDF {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: [SLIDE_W, SLIDE_H],
  });

  // Titelfolie
  paintSlideBackground(doc);
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(40);
  const titleLines = doc.splitTextToSize(
    title || "Präsentation",
    SLIDE_W - SLIDE_MARGIN * 2
  );
  doc.text(titleLines, SLIDE_W / 2, SLIDE_H / 2 - 10, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.setTextColor(...MUTED);
  doc.text(
    `Erstellt mit Everlast · ${DATE_FORMAT.format(new Date())}`,
    SLIDE_W / 2,
    SLIDE_H / 2 + 32,
    { align: "center" }
  );

  slides.forEach((slide, index) => {
    doc.addPage([SLIDE_W, SLIDE_H], "landscape");
    paintSlideBackground(doc);

    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`FOLIE ${index + 1} / ${slides.length}`, SLIDE_MARGIN, 44);

    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    const slideTitleLines = doc.splitTextToSize(
      slide.title || `Folie ${index + 1}`,
      SLIDE_W - SLIDE_MARGIN * 2
    );
    doc.text(slideTitleLines, SLIDE_MARGIN, 90);
    let cursorY = 90 + slideTitleLines.length * 32 + 14;

    if (slide.subtitle) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(15);
      doc.setTextColor(...MUTED);
      const subtitleLines = doc.splitTextToSize(
        slide.subtitle,
        SLIDE_W - SLIDE_MARGIN * 2
      );
      doc.text(subtitleLines, SLIDE_MARGIN, cursorY);
      cursorY += subtitleLines.length * 20 + 12;
    }

    if (slide.bullets?.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(16);
      for (const bullet of slide.bullets) {
        const lines = doc.splitTextToSize(
          bullet,
          SLIDE_W - SLIDE_MARGIN * 2 - 24
        );
        doc.setFillColor(...INK);
        doc.circle(SLIDE_MARGIN + 4, cursorY - 5, 3, "F");
        doc.setTextColor(...INK);
        doc.text(lines, SLIDE_MARGIN + 20, cursorY);
        cursorY += lines.length * 22 + 8;
      }
    }

    if (slide.speakerNotes) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(...MUTED);
      const notesLines = doc.splitTextToSize(
        `Notiz: ${slide.speakerNotes}`,
        SLIDE_W - SLIDE_MARGIN * 2
      );
      doc.text(notesLines, SLIDE_MARGIN, SLIDE_H - 30);
    }
  });

  return doc;
}

// --- Bericht (Briefing) --------------------------------------------------

export type BriefingInput = {
  summary?: string;
  keyPoints?: string[];
  quotes?: string[];
  openQuestions?: string[];
};

const PAGE_W = 595.28; // A4 @ 72dpi
const PAGE_H = 841.89;
const PAGE_MARGIN = 56;
const CONTENT_W = PAGE_W - PAGE_MARGIN * 2;
const FOOTER_Y = PAGE_H - 32;

function newReportPage(doc: jsPDF, title: string) {
  doc.addPage([PAGE_W, PAGE_H], "portrait");
  doc.setFillColor(...SIGNAL);
  doc.rect(0, 0, PAGE_W, 6, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(title.toUpperCase(), PAGE_MARGIN, 34);
  doc.setDrawColor(...LINE);
  doc.line(PAGE_MARGIN, 44, PAGE_W - PAGE_MARGIN, 44);
  return PAGE_MARGIN + 70;
}

function paintPageNumbers(doc: jsPDF) {
  const total = doc.getNumberOfPages();
  for (let page = 2; page <= total; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(`${page - 1} / ${total - 1}`, PAGE_W - PAGE_MARGIN, FOOTER_Y, {
      align: "right",
    });
  }
}

export function buildBriefingPdf(title: string, briefing: BriefingInput): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  // Deckblatt
  doc.setFillColor(...PAPER);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  doc.setFillColor(...SIGNAL);
  doc.rect(0, 0, PAGE_W, 10, "F");
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("BERICHT", PAGE_MARGIN, PAGE_H / 2 - 60);
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  const titleLines = doc.splitTextToSize(title || "Bericht", CONTENT_W);
  doc.text(titleLines, PAGE_MARGIN, PAGE_H / 2 - 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(...MUTED);
  doc.text(
    `Erstellt mit Everlast · ${DATE_FORMAT.format(new Date())}`,
    PAGE_MARGIN,
    PAGE_H / 2 + titleLines.length * 26 + 10
  );

  let cursorY = newReportPage(doc, title || "Bericht");

  function ensureSpace(nextBlockHeight: number) {
    if (cursorY + nextBlockHeight > PAGE_H - PAGE_MARGIN) {
      cursorY = newReportPage(doc, title || "Bericht");
    }
  }

  function heading(label: string) {
    ensureSpace(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...INK);
    doc.text(label, PAGE_MARGIN, cursorY);
    cursorY += 22;
  }

  function paragraph(text: string) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(text, CONTENT_W);
    for (const line of lines) {
      ensureSpace(18);
      doc.text(line, PAGE_MARGIN, cursorY);
      cursorY += 17;
    }
    cursorY += 12;
  }

  function bulletList(items: string[]) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    for (const item of items) {
      const lines = doc.splitTextToSize(item, CONTENT_W - 18);
      ensureSpace(lines.length * 17 + 6);
      doc.setFillColor(...INK);
      doc.circle(PAGE_MARGIN + 3, cursorY - 4, 2.2, "F");
      doc.setTextColor(...INK);
      doc.text(lines, PAGE_MARGIN + 14, cursorY);
      cursorY += lines.length * 17 + 6;
    }
    cursorY += 10;
  }

  function quoteList(items: string[]) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    for (const item of items) {
      const lines = doc.splitTextToSize(`„${item}“`, CONTENT_W - 18);
      ensureSpace(lines.length * 17 + 8);
      doc.setDrawColor(...SIGNAL);
      doc.setLineWidth(2);
      doc.line(PAGE_MARGIN, cursorY - 12, PAGE_MARGIN, cursorY + lines.length * 17 - 6);
      doc.setTextColor(...MUTED);
      doc.text(lines, PAGE_MARGIN + 14, cursorY);
      cursorY += lines.length * 17 + 10;
    }
    cursorY += 6;
  }

  if (briefing.summary) {
    heading("Zusammenfassung");
    paragraph(briefing.summary);
  }
  if (briefing.keyPoints?.length) {
    heading("Kernpunkte");
    bulletList(briefing.keyPoints);
  }
  if (briefing.quotes?.length) {
    heading("Zitate");
    quoteList(briefing.quotes);
  }
  if (briefing.openQuestions?.length) {
    heading("Offene Fragen");
    bulletList(briefing.openQuestions);
  }

  paintPageNumbers(doc);
  return doc;
}
