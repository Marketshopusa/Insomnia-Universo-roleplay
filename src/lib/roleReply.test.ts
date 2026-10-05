import { describe, expect, it } from "vitest";
import { normalizeAssistantReply } from "./roleReply";
import { performSpeech } from "./ttsStream";

describe("role reply presentation", () => {
  it("converts a fenced structured answer to audible narration and dialogue", () => {
    const visible = normalizeAssistantReply('```json\n{"gesto":"Abro el libro","dialogo":"Leo la primera línea."}\n```');
    expect(visible).toBe("*Abro el libro* Leo la primera línea.");
    expect(performSpeech(visible!).text).toContain("Abro el libro.");
    expect(performSpeech(visible!).text).toContain("Leo la primera línea.");
  });
  it("does not display or speak incomplete internal JSON", () => {
    expect(normalizeAssistantReply('```json\n{"gesto":"Abro el libro","dialogo":')).toBeNull();
  });
});
