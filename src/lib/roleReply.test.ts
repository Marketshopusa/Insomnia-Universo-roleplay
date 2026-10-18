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
  it("compacts bloated narration to <=20% action cues and removes cut-off trailing asterisks", () => {
    const bloated = [
      "*Estefanía se retuerce de placer, gimiendo con fuerza mientras su tío la penetra. Sus manos se aferran a las sábanas, buscando apoyo mientras sus caderas se mueven al ritmo de las embestidas.*",
      "¡Ahh! Sí, Tío... no pares. Me encanta sentir cómo me llenas por completo y me haces perder la razón con cada caricia.",
      "*Sus pechos rebotan con cada movimiento, y su respiración se vuelve cada vez más agitada. Mira a su tío con los ojos llenos de lujuria y deseo.*",
      "Estoy tan cerca... ¡Hazme tuya, Tío! ¡Quiero sentirte dentro de mí hasta el final!",
      "*Un escalofrío recorre su cuerpo mientras alcanza el clímax, gritando de placer mientras se aferra a su tío con fuerza.*",
      "¡Ahhh! ¡Tío! Eso fue... increíble, Tío. *Murmura entre jade",
    ].join("\n");
    const visible = normalizeAssistantReply(bloated)!;
    expect(visible).not.toContain("*Murmura entre jade");
    expect((visible.match(/\*/g) || []).length % 2).toBe(0);
    expect(visible.length).toBeLessThanOrEqual(380);
    const actions = [...visible.matchAll(/\*([^*]+)\*/g)].map((m) => m[1]);
    expect(actions.length).toBeLessThanOrEqual(2);
    for (const act of actions) {
      expect(act.split(/\s+/).length).toBeLessThanOrEqual(7);
    }
  });
});
