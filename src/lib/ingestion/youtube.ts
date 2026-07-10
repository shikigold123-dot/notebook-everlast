import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { Innertube, ClientType } from "youtubei.js";
import { transcribeAudioFile } from "./audio";
import { IngestionError } from "./errors";

export type YoutubeExtractionResult = {
  title: string;
  content: string;
  meta: {
    segments: { start_s: number; end_s: number; text_offset: number }[];
    transcriptAvailable?: boolean;
    transcriptSource?:
      | "external-api"
      | "panel"
      | "caption-track"
      | "audio-transcription";
    duration_s?: number;
  };
};

function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const isYoutubeHost =
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com" ||
      host === "youtube-nocookie.com";
    if (isYoutubeHost) {
      const fromQuery = parsed.searchParams.get("v");
      if (fromQuery && /^[a-zA-Z0-9_-]{11}$/.test(fromQuery)) {
        return fromQuery;
      }

      const parts = parsed.pathname.split("/").filter(Boolean);
      const idIndex = parts.findIndex((part) =>
        ["embed", "shorts", "live"].includes(part)
      );
      const fromPath = idIndex >= 0 ? parts[idIndex + 1] : null;
      if (fromPath && /^[a-zA-Z0-9_-]{11}$/.test(fromPath)) {
        return fromPath;
      }
    }

    if (host === "youtu.be") {
      const [fromShortUrl] = parsed.pathname.split("/").filter(Boolean);
      if (fromShortUrl && /^[a-zA-Z0-9_-]{11}$/.test(fromShortUrl)) {
        return fromShortUrl;
      }
    }
  } catch {
    return null;
  }

  return null;
}

type YoutubeInfo = {
  basic_info: {
    title?: string;
    short_description?: string;
    duration?: number;
    view_count?: number;
    author?: string;
    channel?: { name?: string };
    tags?: string[];
    url_canonical?: string;
  };
  captions?: {
    caption_tracks?: {
      base_url: string;
      language_code: string;
      kind?: "asr" | "frc";
      name?: unknown;
      vss_id?: string;
    }[];
  };
  download: (options?: {
    type?: "video" | "audio" | "video+audio";
    quality?: string;
    format?: string;
  }) => Promise<ReadableStream<Uint8Array>>;
  getTranscript: () => Promise<{
    transcript: {
      content?: {
        body?: {
          initial_segments?: {
            snippet?: unknown;
            start_ms?: number | string;
            end_ms?: number | string;
            startMs?: number | string;
            endMs?: number | string;
          }[];
        };
      } | null;
    };
  }>;
};

type NormalizedSegment = {
  text: string;
  start_ms: number;
  end_ms: number;
};

const MAX_YOUTUBE_AUDIO_DURATION_S = 30 * 60;
const MAX_YOUTUBE_AUDIO_BYTES = 25 * 1024 * 1024;

function textFromUnknown(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if (
      "text" in value &&
      typeof (value as { text?: unknown }).text === "string"
    ) {
      return (value as { text: string }).text;
    }
    if (
      "simple_text" in value &&
      typeof (value as { simple_text?: unknown }).simple_text === "string"
    ) {
      return (value as { simple_text: string }).simple_text;
    }
    if (
      "simpleText" in value &&
      typeof (value as { simpleText?: unknown }).simpleText === "string"
    ) {
      return (value as { simpleText: string }).simpleText;
    }
    if (typeof (value as { toString?: unknown }).toString === "function") {
      const text = String(value);
      return text === "[object Object]" ? "" : text;
    }
  }
  return "";
}

function toMs(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizePanelSegments(segments: unknown[]): NormalizedSegment[] {
  return segments
    .map((segment) => {
      if (!segment || typeof segment !== "object") return null;
      const row = segment as {
        snippet?: unknown;
        start_ms?: unknown;
        end_ms?: unknown;
        startMs?: unknown;
        endMs?: unknown;
      };
      const text = textFromUnknown(row.snippet).replace(/\s+/g, " ").trim();
      if (!text) return null;
      const startMs = toMs(row.start_ms ?? row.startMs);
      const endMs = toMs(row.end_ms ?? row.endMs);
      return {
        text,
        start_ms: startMs,
        end_ms: endMs > startMs ? endMs : startMs,
      };
    })
    .filter((segment): segment is NormalizedSegment => Boolean(segment));
}

function decodeEntities(text: string) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

function captionUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  url.searchParams.set("fmt", "json3");
  return url.toString();
}

function parseJson3Caption(text: string): NormalizedSegment[] {
  const json = JSON.parse(text) as {
    events?: {
      tStartMs?: number;
      dDurationMs?: number;
      segs?: { utf8?: string }[];
    }[];
  };

  return (json.events ?? [])
    .map((event) => {
      const segmentText = (event.segs ?? [])
        .map((seg) => seg.utf8 ?? "")
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      if (!segmentText) return null;
      const startMs = toMs(event.tStartMs);
      return {
        text: segmentText,
        start_ms: startMs,
        end_ms: startMs + toMs(event.dDurationMs),
      };
    })
    .filter((segment): segment is NormalizedSegment => Boolean(segment));
}

function parseXmlCaption(text: string): NormalizedSegment[] {
  const rows = text.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g);
  return Array.from(rows)
    .map((match) => {
      const attrs = match[1] ?? "";
      const body = decodeEntities(match[2] ?? "")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!body) return null;
      const start = Number(attrs.match(/\bstart="([^"]+)"/)?.[1] ?? 0);
      const duration = Number(attrs.match(/\bdur="([^"]+)"/)?.[1] ?? 0);
      const startMs = Number.isFinite(start) ? Math.round(start * 1000) : 0;
      const durationMs = Number.isFinite(duration)
        ? Math.round(duration * 1000)
        : 0;
      return {
        text: body,
        start_ms: startMs,
        end_ms: startMs + durationMs,
      };
    })
    .filter((segment): segment is NormalizedSegment => Boolean(segment));
}

type CaptionTrackRef = {
  base_url: string;
  language_code: string;
  kind?: "asr" | "frc";
};

function sortCaptionTracks<T extends { language_code: string; kind?: string }>(
  tracks: T[]
): T[] {
  return [...tracks].sort((a, b) => {
    const languageScore = (track: { language_code: string }) => {
      if (track.language_code.startsWith("de")) return 0;
      if (track.language_code.startsWith("en")) return 1;
      return 2;
    };
    const kindScore = (track: { kind?: string }) => (track.kind === "asr" ? 1 : 0);
    return languageScore(a) - languageScore(b) || kindScore(a) - kindScore(b);
  });
}

async function fetchSegmentsFromCaptionTracks(
  tracks: CaptionTrackRef[]
): Promise<NormalizedSegment[]> {
  for (const track of sortCaptionTracks(tracks)) {
    try {
      const res = await fetch(captionUrl(track.base_url));
      if (!res.ok) {
        console.warn(
          `[youtube] Caption-Track ${track.language_code} lieferte HTTP ${res.status}`
        );
        continue;
      }
      const text = await res.text();
      const segments = text.trim().startsWith("{")
        ? parseJson3Caption(text)
        : parseXmlCaption(text);
      if (segments.length > 0) return segments;
      console.warn(
        `[youtube] Caption-Track ${track.language_code} lieferte 0 Segmente`
      );
    } catch (err) {
      console.warn(
        `[youtube] Caption-Track ${track.language_code} fehlgeschlagen:`,
        err
      );
    }
  }

  return [];
}

async function fetchCaptionTrackSegments(
  info: YoutubeInfo
): Promise<NormalizedSegment[]> {
  return fetchSegmentsFromCaptionTracks(info.captions?.caption_tracks ?? []);
}

// Extrahiert ein balanciertes {...}-JSON-Objekt ab `startIndex`, ohne bei
// verschachtelten "};"-Vorkommen in String-Werten fälschlich abzubrechen
// (ein simples Regex wie /\{.*?\};/ würde dort scheitern).
function extractBalancedJson(text: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let stringChar = "";
  let escaped = false;

  for (let i = startIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(startIndex, i + 1);
    }
  }
  return null;
}

function extractPlayerResponseJson(html: string): unknown {
  const marker = "ytInitialPlayerResponse = ";
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) return null;

  const jsonText = extractBalancedJson(html, markerIndex + marker.length);
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function captionTracksFromPlayerResponse(
  playerResponse: unknown
): CaptionTrackRef[] {
  if (!playerResponse || typeof playerResponse !== "object") return [];
  const captions = (playerResponse as Record<string, unknown>).captions;
  if (!captions || typeof captions !== "object") return [];
  const renderer = (captions as Record<string, unknown>)
    .playerCaptionsTracklistRenderer;
  if (!renderer || typeof renderer !== "object") return [];
  const tracks = (renderer as Record<string, unknown>).captionTracks;
  if (!Array.isArray(tracks)) return [];

  return tracks
    .map((track): CaptionTrackRef | null => {
      if (!track || typeof track !== "object") return null;
      const row = track as Record<string, unknown>;
      const baseUrl = typeof row.baseUrl === "string" ? row.baseUrl : null;
      if (!baseUrl) return null;
      return {
        base_url: baseUrl,
        language_code:
          typeof row.languageCode === "string" ? row.languageCode : "und",
        kind: row.kind === "asr" ? "asr" : undefined,
      };
    })
    .filter((track): track is CaptionTrackRef => Boolean(track));
}

// Fallback, falls die Innertube-API (getInfo/getTranscript) von dieser
// Umgebung aus keine Caption-Tracks liefert (z. B. Anti-Bot-Restriktionen
// gegen Cloud-/Rechenzentrums-IPs auf Vercel/Cloudflare): lädt stattdessen die
// öffentliche Watch-Page-HTML wie ein Browser und liest die Caption-Tracks aus
// der eingebetteten ytInitialPlayerResponse-JSON — dieselbe Technik, die u. a.
// die Python-Bibliothek youtube-transcript-api nutzt.
async function fetchCaptionTracksFromWatchPage(
  videoId: string
): Promise<CaptionTrackRef[]> {
  try {
    const res = await fetch(
      `https://www.youtube.com/watch?v=${videoId}&hl=de`,
      {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "accept-language": "de-DE,de;q=0.9,en;q=0.8",
        },
      }
    );
    if (!res.ok) {
      console.warn(`[youtube] Watch-Page lieferte HTTP ${res.status}`);
      return [];
    }
    const html = await res.text();
    const tracks = captionTracksFromPlayerResponse(
      extractPlayerResponseJson(html)
    );
    if (tracks.length === 0) {
      console.warn(
        `[youtube] Watch-Page enthielt keine Caption-Tracks für ${videoId}`
      );
    }
    return tracks;
  } catch (err) {
    console.warn(`[youtube] Watch-Page-Scrape fehlgeschlagen für ${videoId}:`, err);
    return [];
  }
}

// Weiterer Fallback für den exakten "Precondition check failed"-Fehler des
// WEB-Clients (siehe fehlgeschlagener getTranscript()-Aufruf oben): der
// ANDROID-Client umgeht YouTubes PoToken-A/B-Test für die Transcript-API
// (bestätigtes Muster aus vergleichbaren Community-Tools, z. B.
// mcp-server-youtube-transcript). Läuft in einer eigenen, separaten
// Innertube-Session, damit der normale WEB-Client-Pfad (getInfo/Download)
// unverändert bleibt.
async function fetchTranscriptViaAndroidClient(
  videoId: string
): Promise<NormalizedSegment[]> {
  try {
    const androidYt = await Innertube.create({
      client_type: ClientType.ANDROID,
      retrieve_player: false,
    });
    const info = (await androidYt.getInfo(videoId)) as unknown as YoutubeInfo;
    const transcriptInfo = await info.getTranscript();
    const segments = normalizePanelSegments(
      transcriptInfo.transcript.content?.body?.initial_segments ?? []
    );
    if (segments.length === 0) {
      console.warn(
        `[youtube] ANDROID-Client lieferte 0 Transkript-Segmente für ${videoId}`
      );
    }
    return segments;
  } catch (err) {
    console.warn(
      `[youtube] ANDROID-Client-Transkript fehlgeschlagen für ${videoId}:`,
      err
    );
    return [];
  }
}

function buildResult(
  title: string,
  segments: NormalizedSegment[],
  source: "external-api" | "panel" | "caption-track"
): YoutubeExtractionResult {
  let content = "";
  const metaSegments: {
    start_s: number;
    end_s: number;
    text_offset: number;
  }[] = [];
  for (const seg of segments) {
    metaSegments.push({
      start_s: seg.start_ms / 1000,
      end_s: seg.end_ms / 1000,
      text_offset: content.length,
    });
    content += seg.text + " ";
  }

  return {
    title,
    content: content.trim(),
    meta: {
      segments: metaSegments,
      transcriptAvailable: true,
      transcriptSource: source,
    },
  };
}

async function streamToAudioFile(
  stream: ReadableStream<Uint8Array>
): Promise<File> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    byteLength += value.byteLength;
    if (byteLength > MAX_YOUTUBE_AUDIO_BYTES) {
      throw new IngestionError(
        "Die YouTube-Audiospur ist zu groß für die automatische Transkription. Lade bitte eine kürzere Audio-Datei hoch."
      );
    }
    chunks.push(value);
  }

  if (byteLength === 0) {
    throw new IngestionError("Die YouTube-Audiospur konnte nicht geladen werden.");
  }

  const parts = chunks.map((chunk) => {
    const copy = new Uint8Array(chunk.byteLength);
    copy.set(chunk);
    return copy.buffer;
  });

  return new File(parts, "youtube-audio.webm", { type: "audio/webm" });
}

async function ytDlpStreamToAudioFile(
  stream: AsyncIterable<Buffer | Uint8Array | string>
): Promise<File> {
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  for await (const chunk of stream) {
    const value =
      typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
    byteLength += value.byteLength;
    if (byteLength > MAX_YOUTUBE_AUDIO_BYTES) {
      throw new IngestionError(
        "Die YouTube-Audiospur ist zu groß für die automatische Transkription. Lade bitte eine kürzere Audio-Datei hoch."
      );
    }
    chunks.push(value);
  }

  if (byteLength === 0) {
    throw new IngestionError("Die YouTube-Audiospur konnte nicht geladen werden.");
  }

  const parts = chunks.map((chunk) => {
    const copy = new Uint8Array(chunk.byteLength);
    copy.set(chunk);
    return copy.buffer;
  });

  return new File(parts, "youtube-audio.webm", { type: "audio/webm" });
}

// yt-dlp wird als Python-Zipapp ausgeliefert (Shebang `#!/usr/bin/env python3`)
// und braucht Python 3.10+. Auf macOS zeigt `env python3` oft auf die alte,
// von Apples Command Line Tools mitgelieferte Python-3.9-Version, während ein
// aktuelles Homebrew-Python unversioniert nicht in PATH liegt — deshalb wird
// hier explizit nach einem passenden Interpreter gesucht, statt uns auf die
// Shebang-Auflösung zu verlassen. In Serverless-Umgebungen (Vercel, Cloudflare)
// existiert grundsätzlich kein Python-Interpreter — dort wird der Fallback
// komplett übersprungen, statt einen zwangsläufig scheiternden Prozess zu
// spawnen (ein ENOENT beim Spawnen wurde zuvor zu einer Unhandled Rejection,
// die den gesamten Node-Prozess mit Exit-Code 128 abgeschossen hat).
let cachedPythonBinary: string | null | undefined;

function resolvePythonBinary(): string | null {
  if (cachedPythonBinary !== undefined) return cachedPythonBinary;

  const candidates = [
    process.env.YTDLP_PYTHON_BIN,
    ...["3.13", "3.12", "3.11", "3.10"].flatMap((version) => [
      `/opt/homebrew/bin/python${version}`,
      `/usr/local/bin/python${version}`,
    ]),
  ].filter((candidate): candidate is string => Boolean(candidate));

  cachedPythonBinary =
    candidates.find((candidate) => existsSync(candidate)) ?? null;
  return cachedPythonBinary;
}

async function downloadWithYtDlp(url: string): Promise<File> {
  const pythonBinary = resolvePythonBinary();
  if (!pythonBinary) {
    throw new Error(
      "Kein Python-Interpreter verfügbar — yt-dlp-Fallback wird übersprungen."
    );
  }

  const binaryPath = "node_modules/youtube-dl-exec/bin/yt-dlp";
  const subprocess = spawn(
    pythonBinary,
    [
      binaryPath,
      url,
      "--format",
      "ba[filesize<25M]/ba[filesize_approx<25M]/worstaudio",
      "--output",
      "-",
      "--no-playlist",
      "--no-warnings",
      "--no-progress",
    ],
    { stdio: ["ignore", "pipe", "pipe"], timeout: 120000 }
  );
  // Verhindert, dass ein Spawn-Fehler (z. B. ENOENT) als "Unhandled 'error'
  // event" den ganzen Node-Prozess abschießt, bevor die exit-Promise unten
  // ihren eigenen Listener registrieren kann.
  subprocess.on("error", () => {});

  let stderr = "";
  subprocess.stderr.setEncoding("utf8");
  subprocess.stderr.on("data", (chunk: string) => {
    stderr += chunk;
    if (stderr.length > 4000) stderr = stderr.slice(-4000);
  });

  const exit = new Promise<void>((resolve, reject) => {
    subprocess.on("error", reject);
    subprocess.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `yt-dlp exited with ${code}`));
    });
  });

  const file = await ytDlpStreamToAudioFile(subprocess.stdout).catch((err) => {
    subprocess.kill("SIGTERM");
    throw err;
  });
  await exit;
  return file;
}

async function transcribeYoutubeAudio(
  info: YoutubeInfo,
  url: string
): Promise<YoutubeExtractionResult | null> {
  const duration = info.basic_info.duration;
  if (
    typeof duration === "number" &&
    duration > MAX_YOUTUBE_AUDIO_DURATION_S
  ) {
    throw new IngestionError(
      "YouTube-Videos dürfen für automatische Audio-Transkription höchstens 30 Minuten lang sein."
    );
  }

  try {
    let file: File;
    try {
      const stream = await info.download({
        type: "audio",
        quality: "bestefficiency",
        format: "any",
      });
      file = await streamToAudioFile(stream);
    } catch {
      file = await downloadWithYtDlp(url);
    }
    const transcription = await transcribeAudioFile(file);
    return {
      title: info.basic_info.title ?? "YouTube-Video",
      content: transcription.content,
      meta: {
        segments: [],
        transcriptAvailable: true,
        transcriptSource: "audio-transcription",
        duration_s: transcription.meta.duration_s,
      },
    };
  } catch (err) {
    if (err instanceof IngestionError) throw err;
    return null;
  }
}

type TranscriptApiResult = { title: string | null; segments: NormalizedSegment[] };

// Primäre Transkript-Quelle: transcriptapi.com umgeht YouTubes Anti-Bot-Sperre
// gegen Cloud-/Serverless-IPs (siehe fetchTranscriptViaAndroidClient &
// fetchCaptionTracksFromWatchPage weiter unten, die auf Vercel beide an dieser
// Sperre scheitern). Ohne gesetzten TRANSCRIPT_API_KEY wird sie übersprungen
// und die kostenlose Innertube-Fallback-Kette greift wie zuvor.
async function fetchTranscriptViaTranscriptApi(
  videoId: string
): Promise<TranscriptApiResult | null> {
  const apiKey = process.env.TRANSCRIPT_API_KEY;
  if (!apiKey) return null;

  try {
    const params = new URLSearchParams({
      video_url: videoId,
      format: "json",
      include_timestamp: "true",
      send_metadata: "true",
      language: "de,en",
    });
    const res = await fetch(
      `https://transcriptapi.com/api/v2/youtube/transcript?${params.toString()}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!res.ok) {
      console.warn(
        `[youtube] transcriptapi.com lieferte Status ${res.status} für ${videoId}`
      );
      return null;
    }

    const data = (await res.json()) as {
      transcript?: { text?: unknown; start?: unknown; duration?: unknown }[];
      metadata?: { title?: string };
    };

    const segments = (data.transcript ?? [])
      .map((entry) => {
        const text = textFromUnknown(entry.text);
        if (!text.trim()) return null;
        const startMs = toMs(entry.start) * 1000;
        const durationMs = toMs(entry.duration) * 1000;
        return { text, start_ms: startMs, end_ms: startMs + durationMs };
      })
      .filter((segment): segment is NormalizedSegment => Boolean(segment));

    if (segments.length === 0) {
      console.warn(
        `[youtube] transcriptapi.com lieferte 0 Transkript-Segmente für ${videoId}`
      );
      return null;
    }

    return { title: data.metadata?.title ?? null, segments };
  } catch (err) {
    console.warn(
      `[youtube] transcriptapi.com-Anfrage fehlgeschlagen für ${videoId}:`,
      err
    );
    return null;
  }
}

export async function extractYoutube(
  url: string
): Promise<YoutubeExtractionResult> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new IngestionError("Das ist keine gültige YouTube-URL.");
  }

  const apiResult = await fetchTranscriptViaTranscriptApi(videoId);
  if (apiResult && apiResult.segments.length > 0) {
    return buildResult(apiResult.title ?? url, apiResult.segments, "external-api");
  }

  let info: YoutubeInfo;
  try {
    const yt = await Innertube.create({ retrieve_player: false });
    // youtubei.js' echte VideoInfo/TranscriptInfo-Typen sind komplexer als
    // hier gebraucht; wir casten an der API-Grenze auf die schlanke Form,
    // die dieses Modul tatsächlich konsumiert (Tests mocken die Bibliothek
    // ohnehin vollständig, sodass die echte Laufzeit-Form nie durchläuft).
    info = (await yt.getInfo(videoId)) as unknown as YoutubeInfo;
  } catch (err) {
    console.error(`[youtube] getInfo fehlgeschlagen für ${videoId}:`, err);
    throw new IngestionError(
      "Dieses YouTube-Video konnte nicht geladen werden."
    );
  }

  let segments: NormalizedSegment[] = [];
  try {
    const transcriptInfo = await info.getTranscript();
    segments = normalizePanelSegments(
      transcriptInfo.transcript.content?.body?.initial_segments ?? []
    );
  } catch (err) {
    console.error(`[youtube] getTranscript fehlgeschlagen für ${videoId}:`, err);
    segments = [];
  }

  if (segments.length > 0) {
    return buildResult(info.basic_info.title ?? url, segments, "panel");
  }

  console.warn(
    `[youtube] kein Transkript-Panel für ${videoId}, ${
      info.captions?.caption_tracks?.length ?? 0
    } Caption-Track(s) gefunden`
  );
  segments = await fetchCaptionTrackSegments(info);
  if (segments.length > 0) {
    return buildResult(info.basic_info.title ?? url, segments, "caption-track");
  }

  const watchPageTracks = await fetchCaptionTracksFromWatchPage(videoId);
  if (watchPageTracks.length > 0) {
    segments = await fetchSegmentsFromCaptionTracks(watchPageTracks);
    if (segments.length > 0) {
      return buildResult(info.basic_info.title ?? url, segments, "caption-track");
    }
  }

  segments = await fetchTranscriptViaAndroidClient(videoId);
  if (segments.length > 0) {
    return buildResult(info.basic_info.title ?? url, segments, "panel");
  }

  const audioResult = await transcribeYoutubeAudio(info, url);
  if (audioResult) return audioResult;

  throw new IngestionError(
    "Für dieses YouTube-Video ist kein abrufbares Transkript verfügbar, und die automatische Audio-Transkription ist fehlgeschlagen. Lade bitte eine Audio-Datei des Videos hoch."
  );
}
