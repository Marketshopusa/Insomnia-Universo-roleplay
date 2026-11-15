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
  it("preserves complete generated actions instead of truncating or replacing them", () => {
    const actions = ["*Abro el libro que habíamos dejado sobre la mesa y reviso con atención la nota del margen.*", "*Paso a la página siguiente para comprobar la fecha escrita junto al dibujo.*", "*Cierro el cuaderno y conservo la ficha entre las páginas.*"];
    const input = actions.join("\n") + "\nLa fecha de la ficha coincide con el registro. *Fragmento sin terminar";
    const visible = normalizeAssistantReply(input)!;
    for (const action of actions) expect(visible).toContain(action);
    expect(visible).toContain("La fecha de la ficha coincide con el registro.");
    expect(visible).not.toContain("Fragmento sin terminar");
  });
  it("does not change the active speaker merely because another person enters the scene", () => {
    const info = resolveActiveCharacter("Mi amiga Gabriela abre la puerta y saluda.", [], "Laura", "Daniel");
    expect(info.isSwitched).toBe(false); expect(info.name).toBe("Laura");
  });
  it("follows an explicit director instruction and does not invent a replacement action", () => {
    const info = resolveActiveCharacter("Ahora responde como Gabriela", [], "Laura", "Daniel");
    expect(info.isSwitched).toBe(true); expect(info.name).toBe("Gabriela");
    const reply = "*Laura mira el reloj.* Todavía son las ocho.";
    expect(sanitizeSwitchedReply(reply, info)).toBe(reply);
    expect(sanitizeSwitchedReply(reply, info)).not.toContain("Me acerco a ti");
    const next = resolveActiveCharacter("Seguimos hablando del libro.", [{ role: "user", content: "Ahora responde como Gabriela" }], "Laura", "Daniel");
    expect(next.name).toBe("Gabriela");
    expect(resolveActiveCharacter("Vuelve a tu personaje original", [{ role: "user", content: "Ahora responde como Gabriela" }], "Laura", "Daniel").name).toBe("Laura");
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
  it("preserves complete action cues and cleans trailing cut-off phrases like 'a las...'", () => {
    const input = [
      "*alza una ceja y cruza de brazos apoyada en el marco de la puerta*",
      "Vaya, vaya... bienvenido a casa, roommate. No esperaba el show de bienvenida tan pronto, la verdad.",
      "*se ríe bajo y sacude la cabeza divertida*",
      "Tranquilo, no te vas a morir. Solo eres tú y yo en boxers en la sala a las...",
    ].join("\n");
    const cleaned = normalizeAssistantReply(input)!;
    expect(cleaned).toContain("*alza una ceja y cruza de brazos apoyada en el marco de la puerta*");
    expect(cleaned).toContain("*se ríe bajo y sacude la cabeza divertida*");
    expect(cleaned).not.toContain("a las...");
    expect(cleaned).toContain("en boxers en la sala.");
  });
  it("does not falsely switch character on Venezuelan slang (mamá Huevo) or third-person father friend references", () => {
    const rawTurn = "daniela me voy me voyyy mierdaaaa me corroooo Le digo desbordándome dentro de su boca con tanto gusto y placer eran chorros y chorros intensos, demasiado chorros, se le echa haciendo la tragar y al mismo tiempo a mitad de chorros los saco y le pego el huevo contra la cara llenándole los ojos, la nariz, toda la cara de leche y volviéndolo a meter en su boca para que trague el recibo que queda sintiendo ella la leche caliente del huevo de William del mejor amigo de su papá, que ahora la tenía allí mamá Huevo, tragando leche y sintiendo esa leche caliente sobre ella, sobre toda su cara";
    const info = resolveActiveCharacter(rawTurn, [], "Daniela", "William");
    expect(info.isSwitched).toBe(false);
    expect(info.name).toBe("Daniela");
    expect(info.role).toBe("Daniela");
    expect(info.fullLabel).toBe("Daniela");
  });
});

it("retains both generated components when the provider uses narration/dialogue field names", () => {
  expect(normalizeAssistantReply('{"narracion":"Reviso la fecha.","dialogo":"La carta está fechada el martes."}')).toBe("*Reviso la fecha.* La carta está fechada el martes.");
  expect(normalizeAssistantReply('{"reaction":"I check the date.","dialogue":"The letter is dated Tuesday."}')).toBe("*I check the date.* The letter is dated Tuesday.");
});
it("does not expose a truncated narration/dialogue object as visible chat", () => {
  expect(normalizeAssistantReply('{"narracion":"Reviso la carta","dialogo":"Todavía falta')).toBeNull();
});
