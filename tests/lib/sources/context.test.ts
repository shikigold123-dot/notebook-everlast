// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  isStaleYoutubeMetadataAnswer,
  isUsableContextSource,
} from "@/lib/sources/context";

describe("isUsableContextSource", () => {
  it("akzeptiert YouTube nur mit echtem Transkript-Meta", () => {
    expect(
      isUsableContextSource({
        id: "s-1",
        type: "youtube",
        status: "ready",
        content: "Echtes Transkript",
        meta: { transcriptSource: "audio-transcription" },
      })
    ).toBe(true);

    expect(
      isUsableContextSource({
        id: "s-2",
        type: "youtube",
        status: "ready",
        content: "YouTube-Metadaten: kein Transkript verfügbar.",
        meta: { transcriptAvailable: false },
      })
    ).toBe(false);
  });
});

describe("isStaleYoutubeMetadataAnswer", () => {
  it("erkennt alte Metadaten-Antworten", () => {
    expect(
      isStaleYoutubeMetadataAnswer(
        "Die bereitgestellten Quellen sind Metadaten von YouTube-Videos."
      )
    ).toBe(true);
  });
});
