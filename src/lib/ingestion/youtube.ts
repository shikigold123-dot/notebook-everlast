import { Innertube } from "youtubei.js";
import { IngestionError } from "./errors";

export type YoutubeExtractionResult = {
  title: string;
  content: string;
  meta: {
    segments: { start_s: number; end_s: number; text_offset: number }[];
  };
};

function extractVideoId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

type YoutubeInfo = {
  basic_info: { title?: string };
  getTranscript: () => Promise<{
    transcript: {
      content?: {
        body?: {
          initial_segments?: {
            snippet: { text: string };
            start_ms: number;
            end_ms: number;
          }[];
        };
      } | null;
    };
  }>;
};

export async function extractYoutube(
  url: string
): Promise<YoutubeExtractionResult> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new IngestionError("Das ist keine gültige YouTube-URL.");
  }

  let info: YoutubeInfo;
  try {
    const yt = await Innertube.create({ retrieve_player: false });
    // youtubei.js' echte VideoInfo/TranscriptInfo-Typen sind komplexer als
    // hier gebraucht; wir casten an der API-Grenze auf die schlanke Form,
    // die dieses Modul tatsächlich konsumiert (Tests mocken die Bibliothek
    // ohnehin vollständig, sodass die echte Laufzeit-Form nie durchläuft).
    info = (await yt.getInfo(videoId)) as unknown as YoutubeInfo;
  } catch {
    throw new IngestionError(
      "Dieses YouTube-Video konnte nicht geladen werden."
    );
  }

  let segments: { snippet: { text: string }; start_ms: number; end_ms: number }[];
  try {
    const transcriptInfo = await info.getTranscript();
    segments =
      transcriptInfo.transcript.content?.body?.initial_segments ?? [];
  } catch {
    segments = [];
  }

  if (segments.length === 0) {
    throw new IngestionError("Für dieses Video ist kein Transkript verfügbar.");
  }

  let content = "";
  const metaSegments: {
    start_s: number;
    end_s: number;
    text_offset: number;
  }[] = [];
  for (const seg of segments) {
    const text = String(seg.snippet.text);
    metaSegments.push({
      start_s: seg.start_ms / 1000,
      end_s: seg.end_ms / 1000,
      text_offset: content.length,
    });
    content += text + " ";
  }

  return {
    title: info.basic_info.title ?? url,
    content: content.trim(),
    meta: { segments: metaSegments },
  };
}
