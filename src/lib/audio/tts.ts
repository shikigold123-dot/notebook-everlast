import { put } from "@vercel/blob";
import {
  estimateScriptDuration,
  type AudioScriptTurn,
} from "@/db/repo/audio";

export class AudioSynthesisError extends Error {
  constructor(
    message = "Audio-Datei konnte nicht erzeugt werden — bitte später nochmal versuchen."
  ) {
    super(message);
  }
}

function getVoiceId(speaker: AudioScriptTurn["speaker"]) {
  return speaker === "A"
    ? process.env.ELEVENLABS_VOICE_A
    : process.env.ELEVENLABS_VOICE_B;
}

export function isAudioTtsConfigured() {
  return Boolean(
    process.env.ELEVENLABS_API_KEY &&
      process.env.ELEVENLABS_VOICE_A &&
      process.env.ELEVENLABS_VOICE_B &&
      process.env.BLOB_READ_WRITE_TOKEN
  );
}

async function synthesizeTurn(turn: AudioScriptTurn) {
  const voiceId = getVoiceId(turn.speaker);
  if (!process.env.ELEVENLABS_API_KEY || !voiceId) {
    throw new AudioSynthesisError(
      "ElevenLabs-Konfiguration fehlt — bitte Env-Variablen eintragen."
    );
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        accept: "audio/mpeg",
        "content-type": "application/json",
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text: turn.text,
        model_id: process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2",
      }),
    }
  );

  if (!response.ok) {
    throw new AudioSynthesisError();
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function synthesizeAudioOverview({
  notebookId,
  audioOverviewId,
  script,
}: {
  notebookId: string;
  audioOverviewId: string;
  script: AudioScriptTurn[];
}) {
  if (!isAudioTtsConfigured()) {
    throw new AudioSynthesisError(
      "Audio-Ausgabe ist noch nicht konfiguriert — Skript wurde vorbereitet."
    );
  }

  const segments = await Promise.all(script.map(synthesizeTurn));
  const audio = Buffer.concat(segments);
  const durationS = estimateScriptDuration(script);
  const blob = await put(
    `audio-overviews/${notebookId}/${audioOverviewId}.mp3`,
    audio,
    {
      access: "public",
      allowOverwrite: true,
      contentType: "audio/mpeg",
    }
  );

  return {
    audioBlobUrl: blob.url,
    durationS,
  };
}
