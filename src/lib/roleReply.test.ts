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
  it("converts backtick pseudo-JSON tags without leaking labels", () => {
    const raw = '`gesto`: "Me estremezco de placer" `dialogo`: "WILLIAM!! Ahhh... no pares..."';
    const visible = normalizeAssistantReply(raw);
    expect(visible).toBe('*Me estremezco de placer* WILLIAM!! Ahhh... no pares...');
    expect(visible).not.toContain('gesto');
    expect(visible).not.toContain('dialogo');
  });
  it("strips leaked labels if output format was plain text", () => {
    const raw = '`dialogo`: "Hola, ¿cómo estás hoy?"';
    const visible = normalizeAssistantReply(raw);
    expect(visible).toBe('Hola, ¿cómo estás hoy?');
    expect(visible).not.toContain('dialogo');
  });
});
