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

function fileExtension(filename: string, fallback: string) {
  const ext = path.extname(filename).toLowerCase().replace(/[^a-z0-9.]/g, "");
  return ext || fallback;
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

  const ext = fileExtension(file.name, type === "pdf" ? ".pdf" : ".mp3");
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
