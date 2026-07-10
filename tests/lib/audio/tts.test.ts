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

function wavBuffer(samples: number[]) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => {
    data.writeInt16LE(sample, index * 2);
  });

  const fmt = Buffer.alloc(24);
  fmt.write("fmt ", 0, "ascii");
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8);
  fmt.writeUInt16LE(1, 10);
  fmt.writeUInt32LE(24000, 12);
  fmt.writeUInt32LE(48000, 16);
  fmt.writeUInt16LE(2, 20);
  fmt.writeUInt16LE(16, 22);

  const dataHeader = Buffer.alloc(8);
  dataHeader.write("data", 0, "ascii");
  dataHeader.writeUInt32LE(data.length, 4);

  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(4 + fmt.length + dataHeader.length + data.length, 4);
  header.write("WAVE", 8, "ascii");

  return Buffer.concat([header, fmt, dataHeader, data]);
}

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
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_TTS_MODEL;
  delete process.env.OPENAI_TTS_VOICE_A;
  delete process.env.OPENAI_TTS_VOICE_B;
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

  it("nutzt OpenAI-TTS und Data-URL, wenn ElevenLabs und Blob fehlen", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_VOICE_A;
    delete process.env.ELEVENLABS_VOICE_B;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    process.env.OPENAI_API_KEY = "test-openai";
    process.env.OPENAI_TTS_VOICE_A = "alloy";
    process.env.OPENAI_TTS_VOICE_B = "onyx";

    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(
        new Response(wavBuffer([7, 8, 9]), {
          status: 200,
          headers: { "content-type": "audio/wav" },
        })
      )
    );

    await expect(
      synthesizeAudioOverview({
        notebookId: "nb-1",
        audioOverviewId: "a-1",
        script: SCRIPT,
      })
    ).resolves.toMatchObject({
      audioBlobUrl: expect.stringMatching(/^data:audio\/wav;base64,/),
      durationS: expect.any(Number),
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "https://api.openai.com/v1/audio/speech",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer test-openai",
        }),
      })
    );
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    const secondBody = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
    expect(body.model).toBe("gpt-4o-mini-tts");
    expect(body.voice).toBe("alloy");
    expect(body.input).toBe("Hallo");
    expect(body.response_format).toBe("wav");
    expect(body.instructions).toContain("professionellen Wissenspodcast");
    expect(secondBody.voice).toBe("onyx");
    expect(secondBody.input).toBe("Antwort");
    expect(putMock).not.toHaveBeenCalled();
  });

  it("priorisiert OpenAI-TTS, wenn OpenAI und ElevenLabs konfiguriert sind", async () => {
    process.env.OPENAI_API_KEY = "test-openai";

    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(
        new Response(wavBuffer([7, 8, 9]), {
          status: 200,
          headers: { "content-type": "audio/wav" },
        })
      )
    );

    await synthesizeAudioOverview({
      notebookId: "nb-1",
      audioOverviewId: "a-1",
      script: SCRIPT,
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/audio/speech",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer test-openai",
        }),
      })
    );
    expect(String(vi.mocked(fetch).mock.calls[0][0])).not.toContain(
      "elevenlabs"
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    const secondBody = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
    expect(firstBody.voice).toBe("alloy");
    expect(secondBody.voice).toBe("onyx");
    expect(putMock).toHaveBeenCalledWith(
      "audio-overviews/nb-1/a-1.wav",
      expect.any(Buffer),
      expect.objectContaining({
        access: "public",
        contentType: "audio/wav",
      })
    );
  });
});
