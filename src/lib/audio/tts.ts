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

type SynthesizedAudio = {
  audio: Buffer;
  contentType: "audio/mpeg" | "audio/wav";
  extension: "mp3" | "wav";
};

type WavSegment = {
  fmtChunk: Buffer;
  data: Buffer;
  byteRate: number;
  blockAlign: number;
};

function getVoiceId(speaker: AudioScriptTurn["speaker"]) {
  return speaker === "A"
    ? process.env.ELEVENLABS_VOICE_A
    : process.env.ELEVENLABS_VOICE_B;
}

function getOpenAiVoice(speaker: AudioScriptTurn["speaker"]) {
  if (speaker === "A") return process.env.OPENAI_TTS_VOICE_A ?? "alloy";
  return process.env.OPENAI_TTS_VOICE_B ?? "onyx";
}

function readChunkId(buffer: Buffer, offset: number) {
  return buffer.subarray(offset, offset + 4).toString("ascii");
}

function parseWav(buffer: Buffer): WavSegment {
  if (
    buffer.length < 44 ||
    readChunkId(buffer, 0) !== "RIFF" ||
    readChunkId(buffer, 8) !== "WAVE"
  ) {
    throw new AudioSynthesisError(
      "OpenAI-TTS lieferte kein gültiges WAV-Audio."
    );
  }

  let offset = 12;
  let fmtChunk: Buffer | null = null;
  let data: Buffer | null = null;
  let byteRate = 0;
  let blockAlign = 0;

  while (offset + 8 <= buffer.length) {
    const id = readChunkId(buffer, offset);
    const size = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (id === "fmt ") {
      const chunkEnd = chunkStart + size;
      if (chunkEnd > buffer.length) break;
      fmtChunk = Buffer.from(buffer.subarray(offset, chunkEnd));
      if (size >= 16) {
        byteRate = buffer.readUInt32LE(chunkStart + 8);
        blockAlign = buffer.readUInt16LE(chunkStart + 12);
      }
      offset = chunkEnd + (size % 2);
    } else if (id === "data") {
      const actualSize =
        size === 0xffffffff || chunkStart + size > buffer.length
          ? buffer.length - chunkStart
          : size;
      data = Buffer.from(buffer.subarray(chunkStart, chunkStart + actualSize));
      break;
    } else {
      const chunkEnd = chunkStart + size;
      if (chunkEnd > buffer.length) break;
      offset = chunkEnd + (size % 2);
    }
  }

  if (!fmtChunk || !data || byteRate <= 0 || blockAlign <= 0) {
    throw new AudioSynthesisError(
      "OpenAI-TTS lieferte kein vollständig lesbares WAV-Audio."
    );
  }

  return { fmtChunk, data, byteRate, blockAlign };
}

function silenceFor(segment: WavSegment, ms: number) {
  const rawLength = Math.round((segment.byteRate * ms) / 1000);
  const blockAlign = Math.max(1, segment.blockAlign);
  const alignedLength = rawLength - (rawLength % blockAlign);
  return Buffer.alloc(Math.max(0, alignedLength));
}

function mergeWavSegments(buffers: Buffer[]) {
  const segments = buffers.map(parseWav);
  const first = segments[0];
  if (!first) throw new AudioSynthesisError();

  const dataParts: Buffer[] = [];
  segments.forEach((segment, index) => {
    if (!segment.fmtChunk.equals(first.fmtChunk)) {
      throw new AudioSynthesisError(
        "OpenAI-TTS lieferte WAV-Segmente mit unterschiedlichen Formaten."
      );
    }
    if (index > 0) dataParts.push(silenceFor(first, 220));
    dataParts.push(segment.data);
  });

  const data = Buffer.concat(dataParts);
  const dataHeader = Buffer.alloc(8);
  dataHeader.write("data", 0, "ascii");
  dataHeader.writeUInt32LE(data.length, 4);

  const riffSize = 4 + first.fmtChunk.length + dataHeader.length + data.length;
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(riffSize, 4);
  header.write("WAVE", 8, "ascii");

  return Buffer.concat([header, first.fmtChunk, dataHeader, data]);
}

export function isAudioTtsConfigured() {
  const hasElevenLabs = Boolean(
    process.env.ELEVENLABS_API_KEY &&
      process.env.ELEVENLABS_VOICE_A &&
      process.env.ELEVENLABS_VOICE_B
  );
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY);
  return hasElevenLabs || hasOpenAi;
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

async function synthesizeOpenAiTurn(turn: AudioScriptTurn) {
  if (!process.env.OPENAI_API_KEY) {
    throw new AudioSynthesisError(
      "OpenAI-TTS-Konfiguration fehlt — bitte OPENAI_API_KEY eintragen."
    );
  }

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts",
      voice: getOpenAiVoice(turn.speaker),
      input: turn.text,
      response_format: "wav",
      instructions:
        "Sprich natürliches Deutsch wie in einem ruhigen, professionellen Wissenspodcast. Keine übertriebene Betonung.",
    }),
  });

  if (!response.ok) {
    throw new AudioSynthesisError();
  }

  return Buffer.from(await response.arrayBuffer());
}

async function synthesizeTurnsWithOpenAi(script: AudioScriptTurn[]) {
  return mergeWavSegments(await Promise.all(script.map(synthesizeOpenAiTurn)));
}

async function synthesizeTurnsWithElevenLabs(script: AudioScriptTurn[]) {
  return Buffer.concat(await Promise.all(script.map(synthesizeTurn)));
}

async function synthesizeWithBestProvider(
  script: AudioScriptTurn[]
): Promise<SynthesizedAudio> {
  if (process.env.OPENAI_API_KEY) {
    return {
      audio: await synthesizeTurnsWithOpenAi(script),
      contentType: "audio/wav",
      extension: "wav",
    };
  }
  if (
    process.env.ELEVENLABS_API_KEY &&
    process.env.ELEVENLABS_VOICE_A &&
    process.env.ELEVENLABS_VOICE_B
  ) {
    return {
      audio: await synthesizeTurnsWithElevenLabs(script),
      contentType: "audio/mpeg",
      extension: "mp3",
    };
  }
  throw new AudioSynthesisError(
    "Audio-Ausgabe ist noch nicht konfiguriert — Skript wurde vorbereitet."
  );
}

async function storeAudio({
  notebookId,
  audioOverviewId,
  audio,
  contentType,
  extension,
}: {
  notebookId: string;
  audioOverviewId: string;
  audio: Buffer;
  contentType: SynthesizedAudio["contentType"];
  extension: SynthesizedAudio["extension"];
}) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return `data:${contentType};base64,${audio.toString("base64")}`;
  }

  const blob = await put(
    `audio-overviews/${notebookId}/${audioOverviewId}.${extension}`,
    audio,
    {
      access: "public",
      allowOverwrite: true,
      contentType,
    }
  );
  return blob.url;
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

  const synthesized = await synthesizeWithBestProvider(script);
  const durationS = estimateScriptDuration(script);
  const audioBlobUrl = await storeAudio({
    notebookId,
    audioOverviewId,
    ...synthesized,
  });

  return {
    audioBlobUrl,
    durationS,
  };
}
