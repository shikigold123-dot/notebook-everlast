import OpenAI from "openai";
import { IngestionError } from "./errors";

export type AudioExtractionResult = {
  content: string;
  meta: { duration_s: number };
};

const MAX_DURATION_S = 30 * 60;

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY fehlt — bitte in .env.local eintragen.");
    }
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

const EXTENSION_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  mp4: "audio/mp4",
  wav: "audio/wav",
  m4a: "audio/x-m4a",
  webm: "audio/webm",
};

function guessAudioFile(blobUrl: string): { filename: string; mimeType: string } {
  const match = blobUrl.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/);
  const ext = match ? match[1].toLowerCase() : "mp3";
  const mimeType = EXTENSION_MIME[ext] ?? "audio/mpeg";
  return { filename: `audio.${ext in EXTENSION_MIME ? ext : "mp3"}`, mimeType };
}

export async function extractAudio(
  blobUrl: string
): Promise<AudioExtractionResult> {
  let buffer: ArrayBuffer;
  try {
    const response = await fetch(blobUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    buffer = await response.arrayBuffer();
  } catch {
    throw new IngestionError("Die Audio-Datei konnte nicht geladen werden.");
  }

  const { filename, mimeType } = guessAudioFile(blobUrl);
  const file = new File([buffer], filename, { type: mimeType });
  return transcribeAudioFile(file);
}

export async function transcribeAudioFile(
  file: File
): Promise<AudioExtractionResult> {
  try {
    const client = getClient();
    const transcription = await client.audio.transcriptions.create({
      file,
      model: "whisper-1",
      response_format: "verbose_json",
    });

    if (!transcription.text.trim()) {
      throw new IngestionError("Die Transkription ergab keinen Text.");
    }

    const durationS = Math.round(transcription.duration ?? 0);
    if (durationS > MAX_DURATION_S) {
      throw new IngestionError(
        "Audio-Dateien dürfen höchstens 30 Minuten lang sein."
      );
    }

    return {
      content: transcription.text.trim(),
      meta: { duration_s: durationS },
    };
  } catch (err) {
    if (err instanceof IngestionError) throw err;
    throw new IngestionError(
      "Die Transkription ist fehlgeschlagen — bitte erneut versuchen."
    );
  }
}
