// @vitest-environment node
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { createMock, transcribeAudioFileMock, spawnMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  transcribeAudioFileMock: vi.fn(),
  spawnMock: vi.fn(),
}));
vi.mock("youtubei.js", () => ({
  Innertube: { create: (...args: unknown[]) => createMock(...args) },
}));
vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));
vi.mock("@/lib/ingestion/audio", () => ({
  transcribeAudioFile: (...args: unknown[]) => transcribeAudioFileMock(...args),
}));

import { extractYoutube } from "@/lib/ingestion/youtube";

beforeEach(() => {
  createMock.mockReset();
  transcribeAudioFileMock.mockReset();
  spawnMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extractYoutube", () => {
  function mockYtDlpAudioProcess(bytes = [4, 5, 6]) {
    spawnMock.mockImplementation(() => {
      const subprocess = new EventEmitter() as EventEmitter & {
        stdout: PassThrough;
        stderr: PassThrough;
        kill: ReturnType<typeof vi.fn>;
      };
      subprocess.stdout = new PassThrough();
      subprocess.stderr = new PassThrough();
      subprocess.kill = vi.fn(() => true);

      queueMicrotask(() => {
        subprocess.stdout.end(Buffer.from(bytes));
        subprocess.stderr.end();
        subprocess.emit("close", 0);
      });

      return subprocess;
    });
  }

  function mockTranscript() {
    createMock.mockResolvedValue({
      getInfo: vi.fn().mockResolvedValue({
        basic_info: { title: "Ein Video" },
        getTranscript: vi.fn().mockResolvedValue({
          transcript: {
            content: {
              body: {
                initial_segments: [
                  { snippet: { text: "Hallo" }, start_ms: 0, end_ms: 1000 },
                  { snippet: { text: "Welt" }, start_ms: 1000, end_ms: 2000 },
                ],
              },
            },
          },
        }),
      }),
    });
  }

  it("baut Text und Zeitstempel-Segmente aus dem Transkript", async () => {
    mockTranscript();

    const result = await extractYoutube(
      "https://www.youtube.com/watch?v=abcdefghijk"
    );

    expect(result.title).toBe("Ein Video");
    expect(result.content).toBe("Hallo Welt");
    expect(result.meta.segments).toEqual([
      { start_s: 0, end_s: 1, text_offset: 0 },
      { start_s: 1, end_s: 2, text_offset: 6 },
    ]);
    expect(result.meta.transcriptAvailable).toBe(true);
    expect(result.meta.transcriptSource).toBe("panel");
  });

  it.each([
    "https://youtu.be/abcdefghijk?si=test",
    "https://www.youtube.com/embed/abcdefghijk",
    "https://www.youtube.com/shorts/abcdefghijk",
    "https://www.youtube.com/live/abcdefghijk",
    "https://m.youtube.com/watch?v=abcdefghijk",
    "https://music.youtube.com/watch?v=abcdefghijk",
  ])("erkennt YouTube-URL-Format %s", async (url) => {
    mockTranscript();

    await expect(extractYoutube(url)).resolves.toMatchObject({
      title: "Ein Video",
      content: "Hallo Welt",
    });
  });

  it("wirft IngestionError bei ungültiger URL", async () => {
    await expect(
      extractYoutube("https://example.com/nicht-youtube")
    ).rejects.toThrow("Das ist keine gültige YouTube-URL.");
  });

  it("liest Text-Objekte und String-Zeitstempel aus echten Transcript-Segmenten", async () => {
    createMock.mockResolvedValue({
      getInfo: vi.fn().mockResolvedValue({
        basic_info: { title: "Echtes Segment" },
        getTranscript: vi.fn().mockResolvedValue({
          transcript: {
            content: {
              body: {
                initial_segments: [
                  {
                    snippet: { toString: () => "Hallo aus Text" },
                    start_ms: "0",
                    end_ms: "1500",
                  },
                ],
              },
            },
          },
        }),
      }),
    });

    await expect(
      extractYoutube("https://www.youtube.com/watch?v=abcdefghijk")
    ).resolves.toMatchObject({
      title: "Echtes Segment",
      content: "Hallo aus Text",
      meta: {
        segments: [{ start_s: 0, end_s: 1.5, text_offset: 0 }],
        transcriptSource: "panel",
      },
    });
  });

  it("nutzt Caption-Tracks, wenn das Transcript-Panel leer ist", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          events: [
            {
              tStartMs: 0,
              dDurationMs: 1000,
              segs: [{ utf8: "Caption" }, { utf8: " Track" }],
            },
            {
              tStartMs: 1000,
              dDurationMs: 1500,
              segs: [{ utf8: "Fallback" }],
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    createMock.mockResolvedValue({
      getInfo: vi.fn().mockResolvedValue({
        basic_info: { title: "Mit Captions" },
        captions: {
          caption_tracks: [
            {
              base_url: "https://example.test/caption?lang=en",
              language_code: "en",
              kind: "asr",
            },
          ],
        },
        getTranscript: vi.fn().mockRejectedValue(new Error("Kein Panel")),
      }),
    });

    await expect(
      extractYoutube("https://www.youtube.com/watch?v=abcdefghijk")
    ).resolves.toMatchObject({
      title: "Mit Captions",
      content: "Caption Track Fallback",
      meta: {
        segments: [
          { start_s: 0, end_s: 1, text_offset: 0 },
          { start_s: 1, end_s: 2.5, text_offset: 14 },
        ],
        transcriptSource: "caption-track",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/caption?lang=en&fmt=json3"
    );
  });

  it("transkribiert die YouTube-Audiospur, wenn kein Caption-Track verfügbar ist", async () => {
    transcribeAudioFileMock.mockResolvedValue({
      content: "Transkript aus Audiospur",
      meta: { duration_s: 123 },
    });
    createMock.mockResolvedValue({
      getInfo: vi.fn().mockResolvedValue({
        basic_info: { title: "Ohne Captions", duration: 123 },
        captions: { caption_tracks: [] },
        download: vi.fn().mockResolvedValue(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array([1, 2, 3]));
              controller.close();
            },
          })
        ),
        getTranscript: vi.fn().mockRejectedValue(new Error("Kein Panel")),
      }),
    });

    await expect(
      extractYoutube("https://www.youtube.com/watch?v=abcdefghijk")
    ).resolves.toMatchObject({
      title: "Ohne Captions",
      content: "Transkript aus Audiospur",
      meta: {
        segments: [],
        transcriptAvailable: true,
        transcriptSource: "audio-transcription",
        duration_s: 123,
      },
    });
    expect(transcribeAudioFileMock).toHaveBeenCalledWith(expect.any(File));
  });

  it("nutzt yt-dlp, wenn youtubei.js die Audiospur nicht entschlüsseln kann", async () => {
    transcribeAudioFileMock.mockResolvedValue({
      content: "Transkript aus yt-dlp",
      meta: { duration_s: 123 },
    });
    mockYtDlpAudioProcess();
    createMock.mockResolvedValue({
      getInfo: vi.fn().mockResolvedValue({
        basic_info: { title: "Signaturproblem", duration: 123 },
        captions: { caption_tracks: [] },
        download: vi.fn().mockRejectedValue(new Error("No valid URL to decipher")),
        getTranscript: vi.fn().mockRejectedValue(new Error("Kein Panel")),
      }),
    });

    await expect(
      extractYoutube("https://www.youtube.com/watch?v=abcdefghijk")
    ).resolves.toMatchObject({
      title: "Signaturproblem",
      content: "Transkript aus yt-dlp",
      meta: {
        transcriptSource: "audio-transcription",
      },
    });
    // Der Interpreter-Pfad ist maschinenabhängig (siehe resolvePythonBinary),
    // daher wird hier nur geprüft, dass die yt-dlp-Zipapp als erstes Argument
    // an *einen* Python-Interpreter übergeben wird — nicht welcher genau.
    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        "node_modules/youtube-dl-exec/bin/yt-dlp",
        "https://www.youtube.com/watch?v=abcdefghijk",
        "--output",
        "-",
        "--no-playlist",
      ]),
      expect.objectContaining({ timeout: 120000 })
    );
  });

  it("wirft einen IngestionError ohne abrufbares Transkript", async () => {
    createMock.mockResolvedValue({
      getInfo: vi.fn().mockResolvedValue({
        basic_info: {
          title: "Ohne Transkript",
          author: "Testkanal",
          short_description: "Videobeschreibung",
          duration: 125,
          tags: ["KI", "Tutorial"],
        },
        getTranscript: vi.fn().mockResolvedValue({
          transcript: { content: { body: { initial_segments: [] } } },
        }),
      }),
    });

    await expect(
      extractYoutube("https://www.youtube.com/watch?v=abcdefghijk")
    ).rejects.toThrow("kein abrufbares Transkript");
  });
});
