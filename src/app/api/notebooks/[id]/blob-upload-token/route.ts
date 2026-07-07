import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { readVisitorId } from "@/lib/visitor";
import { getNotebook } from "@/db/repo/notebooks";
import {
  UPLOAD_MAX_SIZES,
  UPLOAD_CONTENT_TYPES,
} from "@/lib/ingestion/upload-limits";

export function tokenOptionsForType(clientPayload: string | null) {
  const payload = clientPayload ? JSON.parse(clientPayload) : {};
  const type: "pdf" | "audio" = payload.type === "audio" ? "audio" : "pdf";
  return {
    allowedContentTypes: UPLOAD_CONTENT_TYPES[type],
    maximumSizeInBytes: UPLOAD_MAX_SIZES[type],
    tokenPayload: clientPayload ?? "{}",
  };
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
      { error: "Dossier nicht gefunden." },
      { status: 404 }
    );
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) =>
        tokenOptionsForType(clientPayload),
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
