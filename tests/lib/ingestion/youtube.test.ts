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
  ClientType: { WEB: "WEB", ANDROID: "ANDROID" },
}));
vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));
const { existsSyncMock } = vi.hoisted(() => ({ existsSyncMock: vi.fn() }));
vi.mock("node:fs", () => ({ existsSync: (...args: unknown[]) => existsSyncMock(...args) }));
vi.mock("@/lib/ingestion/audio", () => ({
  transcribeAudioFile: (...args: unknown[]) => transcribeAudioFileMock(...args),
}));

import { extractYoutube } from "@/lib/ingestion/youtube";

beforeEach(() => {
  createMock.mockReset();
  transcribeAudioFileMock.mockReset();
  spawnMock.mockReset();
  existsSyncMock.mockReset().mockReturnValue(true);
  vi.stubEnv("TRANSCRIPT_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
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

  it("nutzt transcriptapi.com als primäre Quelle, wenn ein API-Key gesetzt ist", async () => {
    vi.stubEnv("TRANSCRIPT_API_KEY", "test-api-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        transcript: [
          { text: "Hallo", start: 0, duration: 1 },
          { text: "Welt", start: 1, duration: 1 },
        ],
        metadata: { title: "Externes Transkript" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      extractYoutube("https://www.youtube.com/watch?v=abcdefghijk")
    ).resolves.toMatchObject({
      title: "Externes Transkript",
      content: "Hallo Welt",
      meta: {
        segments: [
          { start_s: 0, end_s: 1, text_offset: 0 },
          { start_s: 1, end_s: 2, text_offset: 6 },
        ],
        transcriptSource: "external-api",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "https://transcriptapi.com/api/v2/youtube/transcript?"
      ),
      expect.objectContaining({
        headers: { Authorization: "Bearer test-api-key" },
      })
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("fällt auf die Innertube-Kette zurück, wenn transcriptapi.com fehlschlägt", async () => {
    vi.stubEnv("TRANSCRIPT_API_KEY", "test-api-key");
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 402 });
    vi.stubGlobal("fetch", fetchMock);
    mockTranscript();

    await expect(
      extractYoutube("https://www.youtube.com/watch?v=abcdefghijk")
    ).resolves.toMatchObject({
      title: "Ein Video",
      content: "Hallo Welt",
      meta: { transcriptSource: "panel" },
    });
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

  it("liest Caption-Tracks von der Watch-Page, wenn Innertube keine liefert", async () => {
    const watchPageHtml = `<html><body><script>var ytInitialPlayerResponse = ${JSON.stringify(
      {
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [
              {
                baseUrl: "https://example.test/scraped-caption?lang=de",
                languageCode: "de",
                kind: "asr",
              },
            ],
          },
        },
      }
    )};var other = {};</script></body></html>`;

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/watch?v=")) {
        return Promise.resolve({ ok: true, text: async () => watchPageHtml });
      }
      return Promise.resolve({
        ok: true,
        text: async () =>
          JSON.stringify({
            events: [
              {
                tStartMs: 0,
                dDurationMs: 2000,
                segs: [{ utf8: "Von der Watch-Page" }],
              },
            ],
          }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    createMock.mockResolvedValue({
      getInfo: vi.fn().mockResolvedValue({
        basic_info: { title: "Keine Innertube-Captions" },
        captions: { caption_tracks: [] },
        getTranscript: vi.fn().mockRejectedValue(new Error("Kein Panel")),
      }),
    });

    await expect(
      extractYoutube("https://www.youtube.com/watch?v=abcdefghijk")
    ).resolves.toMatchObject({
      title: "Keine Innertube-Captions",
      content: "Von der Watch-Page",
      meta: { transcriptSource: "caption-track" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.youtube.com/watch?v=abcdefghijk&hl=de",
      expect.objectContaining({
        headers: expect.objectContaining({
          "user-agent": expect.stringContaining("Mozilla"),
        }),
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/scraped-caption?lang=de&fmt=json3"
    );
  });

  it("fällt auf Audio-Transkription zurück, wenn auch die Watch-Page keine Captions liefert", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "<html><body>keine player response hier</body></html>",
    });
    vi.stubGlobal("fetch", fetchMock);
    transcribeAudioFileMock.mockResolvedValue({
      content: "Audio-Transkript",
      meta: { duration_s: 42 },
    });
    mockYtDlpAudioProcess();

    createMock.mockResolvedValue({
      getInfo: vi.fn().mockResolvedValue({
        basic_info: { title: "Ganz ohne Captions", duration: 60 },
        captions: { caption_tracks: [] },
        download: vi.fn().mockRejectedValue(new Error("No valid URL to decipher")),
        getTranscript: vi.fn().mockRejectedValue(new Error("Kein Panel")),
      }),
    });

    await expect(
      extractYoutube("https://www.youtube.com/watch?v=abcdefghijk")
    ).resolves.toMatchObject({
      content: "Audio-Transkript",
      meta: { transcriptSource: "audio-transcription" },
    });
  });

  it("nutzt den ANDROID-Client als letzten Transkript-Fallback vor der Audio-Transkription", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "<html><body>keine player response hier</body></html>",
      })
    );

    createMock.mockImplementation((options?: { client_type?: string }) => {
      if (options?.client_type === "ANDROID") {
        return Promise.resolve({
          getInfo: vi.fn().mockResolvedValue({
            basic_info: { title: "Nur per ANDROID-Client" },
            getTranscript: vi.fn().mockResolvedValue({
              transcript: {
                content: {
                  body: {
                    initial_segments: [
                      { snippet: "Android-Transkript", start_ms: 0, end_ms: 1000 },
                    ],
                  },
                },
              },
            }),
          }),
        });
      }
      return Promise.resolve({
        getInfo: vi.fn().mockResolvedValue({
          basic_info: { title: "WEB-Client-Titel", duration: 60 },
          captions: { caption_tracks: [] },
          getTranscript: vi.fn().mockRejectedValue(new Error("Kein Panel")),
        }),
      });
    });

    await expect(
      extractYoutube("https://www.youtube.com/watch?v=abcdefghijk")
    ).resolves.toMatchObject({
      title: "WEB-Client-Titel",
      content: "Android-Transkript",
      meta: { transcriptSource: "panel" },
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ client_type: "ANDROID" })
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

  it("überspringt yt-dlp ohne Absturz, wenn kein Python-Interpreter gefunden wird (Serverless)", async () => {
    // Simuliert Vercel/Cloudflare: kein Homebrew-Python vorhanden. Vorher
    // führte das zu einem "spawn python3 ENOENT", der als Unhandled Rejection
    // den gesamten Node-Prozess abgeschossen hat (Exit 128).
    existsSyncMock.mockReturnValue(false);
    vi.resetModules();
    const { extractYoutube: extractYoutubeFresh } = await import(
      "@/lib/ingestion/youtube"
    );

    createMock.mockResolvedValue({
      getInfo: vi.fn().mockResolvedValue({
        basic_info: { title: "Kein Python", duration: 123 },
        captions: { caption_tracks: [] },
        download: vi.fn().mockRejectedValue(new Error("No valid URL to decipher")),
        getTranscript: vi.fn().mockRejectedValue(new Error("Kein Panel")),
      }),
    });

    await expect(
      extractYoutubeFresh("https://www.youtube.com/watch?v=abcdefghijk")
    ).rejects.toThrow("kein abrufbares Transkript");
    expect(spawnMock).not.toHaveBeenCalled();
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
