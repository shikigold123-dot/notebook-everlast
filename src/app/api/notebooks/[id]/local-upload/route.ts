import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { getNotebook } from "@/db/repo/notebooks";
import {
  UPLOAD_CONTENT_TYPES,
  UPLOAD_MAX_SIZES,
} from "@/lib/ingestion/upload-limits";
import { readVisitorId } from "@/lib/visitor";

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

// Sicherheitskritisch: Die gespeicherte Dateiendung darf NIE aus dem
// nutzergesteuerten `file.name` stammen (Stored-XSS via z. B. "evil.html" mit
// vorgetäuschtem application/pdf-MIME-Type). Sie wird ausschließlich aus dem
// bereits validierten `type`/MIME ermittelt — unabhängig davon, welcher Zweig
// von `isAllowedFile` die Datei akzeptiert hat.
const AUDIO_EXTENSION_BY_MIME: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/wav": ".wav",
  "audio/x-m4a": ".m4a",
  "audio/webm": ".webm",
};

function safeExtensionFor(type: "pdf" | "audio", mimeType: string) {
  if (type === "pdf") return ".pdf";
  return AUDIO_EXTENSION_BY_MIME[mimeType] ?? ".mp3";
}

function isAllowedFile(file: File, type: "pdf" | "audio") {
  if (type === "pdf") {
    return (
      UPLOAD_CONTENT_TYPES.pdf.includes(file.type) ||
      file.name.toLowerCase().endsWith(".pdf")
    );
  }

  return (
    UPLOAD_CONTENT_TYPES.audio.includes(file.type) ||
    file.type.startsWith("audio/")
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: notebookId } = await params;
  const visitorId = readVisitorId(await cookies());
  if (!visitorId) {
    return NextResponse.json(
      { error: "Keine Besucher-Session — bitte Seite neu laden." },
      { status: 401 }
    );
  }

  const notebook = await getNotebook(getDb(), visitorId, notebookId);
  if (!notebook) {
    return NextResponse.json(
      { error: "Notebook nicht gefunden." },
      { status: 404 }
    );
  }
  if (notebook.isDemo) {
    return NextResponse.json(
      { error: "Demo-Notebook ist schreibgeschützt." },
      { status: 403 }
    );
  }

  const form = await request.formData();
  const type = form.get("type") === "audio" ? "audio" : "pdf";
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Datei fehlt." }, { status: 400 });
  }

  if (file.size > UPLOAD_MAX_SIZES[type]) {
    return NextResponse.json(
      {
        error:
          type === "pdf"
            ? "PDF-Dateien dürfen höchstens 15 MB groß sein."
            : "Audio-Dateien dürfen höchstens 25 MB groß sein.",
      },
      { status: 400 }
    );
  }

  if (!isAllowedFile(file, type)) {
    return NextResponse.json(
      { error: "Dieser Dateityp wird nicht unterstützt." },
      { status: 400 }
    );
  }

  const ext = safeExtensionFor(type, file.type);
  const dir = path.join(UPLOAD_ROOT, notebookId);
  const filename = `${randomUUID()}${ext}`;
  const target = path.join(dir, filename);
  await mkdir(dir, { recursive: true });
  await writeFile(target, Buffer.from(await file.arrayBuffer()));

  const url = new URL(request.url);
  url.pathname = `/uploads/${notebookId}/${filename}`;
  url.search = "";

  return NextResponse.json({
    url: url.toString(),
    pathname: `/uploads/${notebookId}/${filename}`,
    contentType: file.type,
    size: file.size,
  });
}
