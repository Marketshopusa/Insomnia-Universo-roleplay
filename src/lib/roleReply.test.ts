import { describe, expect, it } from "vitest";
import { isRepeatedAssistantReply, normalizeAssistantReply, resolveActiveCharacter, sanitizeSwitchedReply } from "./roleReply";
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
  it("detects when the user introduces another character like sister Gabriela and sanitizes niece leaks", () => {
    const userLine = "Mi hermana Gabriela abre la puerta. Y me conseguí allí en toallas sin importar las altas sobre mí para darme un abrazote Y apretarse fuente contra mí de la emoción";
    const info = resolveActiveCharacter(userLine, [], "Estefanía (la sobrina)", "William (el tío)");
    expect(info.isSwitched).toBe(true);
    expect(info.name).toBe("Gabriela");
    expect(info.role).toBe("la hermana de William");
    expect(info.fullLabel).toBe("Gabriela (la hermana de William)");
    expect(info.addressTerm).toBe("hermano");

    // Keeps Gabriela active on subsequent turn when no other character is named
    const nextInfo = resolveActiveCharacter("La abrazo fuerte contra mi pecho", [{ role: "user", content: userLine }], "Estefanía (la sobrina)", "William (el tío)");
    expect(nextInfo.isSwitched).toBe(true);
    expect(nextInfo.name).toBe("Gabriela");

    const leaked = "*Estefanía se sonroja y mira*\nTe extrañé mucho, hermano.";
    const cleaned = sanitizeSwitchedReply(leaked, info);
    expect(cleaned).not.toContain("*Estefanía");
    expect(cleaned).toContain("*Me acerco a ti*");
    expect(cleaned).toContain("hermano");
  });
  it("keeps sister active when user mentions Estefanía/sobrina in third person and does not block vocabulary words", () => {
    const turn1 = "La abrazo por la cintura la pego hacia mí, le digo yo también te extrañé mucho hermana pero tú sabes que tuvimos algo más que una relación como hermanos";
    const turn2 = "le digo claro que no olvidaría un momento así si el mejor efecto de ese momento lo tuve hace unos minutos atrás y ese efecto era Estefanía porque aunque mi hermana no me lo había confesado, Estefanía no era mi sobrina, era mi hija";
    const turn3 = "tú sabes que Estefanía tiene mis mismos ojos y cuando Estefanía me abrazó sentí la verdad";
    const info = resolveActiveCharacter(turn3, [{ role: "user", content: turn1 }, { role: "user", content: turn2 }], "Estefanía", "Willian");
    expect(info.isSwitched).toBe(true);
    expect(info.name).toBe("la hermana de Willian");
    expect(info.role).toBe("la hermana de Willian");
    expect(info.fullLabel).toBe("la hermana de Willian");
    expect(info.addressTerm).toBe("hermano");

    // Does NOT block or strip legitimate words like "director", "papá", "tío", or "Estefanía"
    const replyText = "*Me estremezco* Willian, Estefanía sigue pensando que eres su tío y el director del colegio nos vio llegar.";
    const cleaned = sanitizeSwitchedReply(replyText, info);
    expect(cleaned).toContain("director");
    expect(cleaned).toContain("tío");
    expect(cleaned).toContain("Estefanía");
  });
  it("detects verbatim and near-duplicate assistant replies in history", () => {
    const prevReply = "*Me estremezco al escuchar tus palabras, hermano* Willian, no puedes borrar lo que pasó entre nosotros esa noche; el deseo me sigue quemando por dentro cada vez que me tocas así.";
    const history = [
      { role: "user", content: "yo también te extrañé mucho hermana" },
      { role: "assistant", content: prevReply },
    ];
    expect(isRepeatedAssistantReply(prevReply, history)).toBe(true);
    expect(
      isRepeatedAssistantReply(
        "*Me estremezco al escuchar tus palabras, hermano* Willian, no puedes borrar lo que pasó entre nosotros aquella vez.",
        history,
      ),
    ).toBe(true);
    expect(
      isRepeatedAssistantReply(
        "*Me quedo sin aliento y te miro con los ojos abiertos* ¿Cómo supiste la verdad, Willian? Guardé ese secreto durante años.",
        history,
      ),
    ).toBe(false);
  });
});

