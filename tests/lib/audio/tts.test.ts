// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const putMock = vi.fn();
vi.mock("@vercel/blob", () => ({
  put: (...args: unknown[]) => putMock(...args),
}));

import {
  AudioSynthesisError,
  isAudioTtsConfigured,
  synthesizeAudioOverview,
} from "@/lib/audio/tts";

const SCRIPT = [
  { speaker: "A" as const, text: "Hallo" },
  { speaker: "B" as const, text: "Antwort" },
];

beforeEach(() => {
  process.env.ELEVENLABS_API_KEY = "test-eleven";
  process.env.ELEVENLABS_VOICE_A = "voice-a";
  process.env.ELEVENLABS_VOICE_B = "voice-b";
  process.env.BLOB_READ_WRITE_TOKEN = "test-blob";
  vi.stubGlobal("fetch", vi.fn());
  putMock.mockReset().mockResolvedValue({ url: "https://blob.example/audio.mp3" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_VOICE_A;
  delete process.env.ELEVENLABS_VOICE_B;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.ELEVENLABS_MODEL;
});

describe("isAudioTtsConfigured", () => {
  it("prüft alle nötigen Env-Variablen", () => {
    expect(isAudioTtsConfigured()).toBe(true);
    delete process.env.ELEVENLABS_VOICE_B;
    expect(isAudioTtsConfigured()).toBe(false);
  });
});

describe("synthesizeAudioOverview", () => {
  it("erzeugt Segmente und speichert eine MP3 im Blob", async () => {
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "audio/mpeg" },
      }))
    );

    await expect(
      synthesizeAudioOverview({
        notebookId: "nb-1",
        audioOverviewId: "a-1",
        script: SCRIPT,
      })
    ).resolves.toEqual({
      audioBlobUrl: "https://blob.example/audio.mp3",
      durationS: expect.any(Number),
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/text-to-speech/voice-a"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "xi-api-key": "test-eleven",
        }),
      })
    );
    expect(putMock).toHaveBeenCalledWith(
      "audio-overviews/nb-1/a-1.mp3",
      expect.any(Buffer),
      expect.objectContaining({
        access: "public",
        contentType: "audio/mpeg",
      })
    );
  });

  it("wirft bei fehlender Konfiguration", async () => {
    delete process.env.ELEVENLABS_API_KEY;

    await expect(
      synthesizeAudioOverview({
        notebookId: "nb-1",
        audioOverviewId: "a-1",
        script: SCRIPT,
      })
    ).rejects.toThrow("Audio-Ausgabe ist noch nicht konfiguriert");
  });

  it("normalisiert ElevenLabs-Fehler", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("kaputt", { status: 500 }));

    await expect(
      synthesizeAudioOverview({
        notebookId: "nb-1",
        audioOverviewId: "a-1",
        script: SCRIPT,
      })
    ).rejects.toThrow(AudioSynthesisError);
  });
});
