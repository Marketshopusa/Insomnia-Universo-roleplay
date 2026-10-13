import { expect, it } from "vitest";
import { prepareExpressiveSpeech as score, expressiveDirection, hasVocalCue } from "./expressiveSpeech.mjs";

it("performs pain at the event, preserving the physical action and exact dialogue", () => {
  const result = score('*Grité de dolor y me agarré el brazo* «Ahhh, no me toques»');
  expect(result.segments.map((part) => part.kind)).toEqual(["reaction", "narration", "dialogue"]);
  expect(result.reactions.map((part) => part.event)).toEqual(["pain_scream"]);
  expect(result.text).toBe('[shouting] ¡Aaaah! Me agarré el brazo. «Ahhh, no me toques»');
});

it("keeps consecutive reactions and narration in order, with local delivery", () => {
  const result = score('*Grito de dolor* «Ayúdame». *Sollozo y me siento en la cama* «Me duele». *Sonrío* «Gracias»');
  expect(result.reactions.map((part) => part.event)).toEqual(["pain_scream", "sob"]);
  expect(result.segments.filter((part) => part.kind === "dialogue").map((part) => [part.text, part.performance]))
    .toEqual([['«Ayúdame»', "pain"], ['«Me duele»', "sad"], ['«Gracias»', "warm"]]);
  expect(result.performance).toBe("neutral");
  expect(result.text).toContain("Me siento en la cama.");
  expect(expressiveDirection(result)).toContain("return to ordinary narration");
});

it.each([
  ["*Río*", "laugh"], ["(Sollozo)", "sob"], ["**Lloro con fuerza**", "cry"],
  ["*Suspiro*", "sigh"], ["*Jadeo por el esfuerzo*", "pant"], ["*Gimo de dolor*", "pain_groan"],
  ["*Gimo de placer*", "pleasure_moan"], ["*Gruño*", "grunt"], ["*Toso*", "cough"],
  ["*Estornudo*", "sneeze"], ["*Carraspeo*", "throat_clear"], ["*Aspiro aire de golpe*", "gasp"],
  ["*Risa bajita*", "chuckle"], ["*Sonido gutural*", "growl"],
])("recognizes %s without converting it into a different reaction", (text, event) => {
  const result = score(text);
  expect(result.reactions.map((part) => part.event)).toEqual([event]);
  expect(result.text.length).toBeGreaterThan(0);
  expect(result.text).not.toMatch(/\[(?:sobbing|crying|gasping|groaning)\]/i);
});

it("accepts reactions with no spoken words and does not replace a sob with a sigh", () => {
  expect(score("*Sollozo*").text).toBe("Hh... ah... hh...");
  expect(score("*Río*").segments.every((part) => part.kind === "reaction")).toBe(true);
});

it.each(["*No grito*", "*Quiero gritar*", "*Voy a llorar*", "*Recuerdo que gritó ayer*", '«Ella gritó ayer, pero yo no lloré»'])
("does not perform negated, intended, remembered or quoted sounds: %s", (text) => {
  expect(score(text).reactions).toHaveLength(0);
});

it("does not let an unrelated negative clause cancel a real scream", () => {
  expect(score("*Grito y no puedo moverme* Ayúdame").text).toBe("[shouting] ¡Aaaah! No puedo moverme. Ayúdame");
});

it("interprets unmarked third person narration while keeping quoted dialogue literal", () => {
  expect(score("Ella abrió la puerta y gritó.").text).toBe("Ella abrió la puerta. [shouting] ¡Aaaah!");
  expect(score('«Grité de dolor y lloré»').text).toBe('«Grité de dolor y lloré»');
});

it("a smile and whisper affect the next dialogue without adding laughter or a sigh", () => {
  expect(score("*Sonrío* Hola.").reactions).toHaveLength(0);
  expect(score("*Susurro* Hola.").reactions).toHaveLength(0);
  expect(score("*Susurro* Hola.").performance).toBe("soft");
  expect(score("*Me siento ofendida y molesta* Eso no está bien.").performance).toBe("angry");
});

it("does not assume pleasure from exertion or invent cultural noises", () => {
  expect(score("*Jadeo por el esfuerzo* Sigue.").performance).toBe("soft");
  expect(score("*Gimo* Sigue.").reactions[0].event).toBe("groan");
  expect(score("*Hago un gesto venezolano* Hola, chamo.").reactions).toHaveLength(0);
  expect(expressiveDirection(score("*Sonrío* Hola."))).toContain("Do not invent accents");
});

it("retains all three sounds in the reported pain/crying example", () => {
  const result = score("*Grité de dolor, lloro con fuerza y grito* Ayúdame.");
  expect(result.reactions.map((part) => part.event)).toEqual(["pain_scream", "cry", "scream"]);
  expect(result.text.endsWith("Ayúdame.")).toBe(true);
});


it("does not mistake the river noun for laughter", () => {
  expect(score("*Cruzo el río* Hace frío.").reactions).toHaveLength(0);
  expect(score("El río está tranquilo.").reactions).toHaveLength(0);
});

it("supports dialogue inside an action without losing the surrounding sounds", () => {
  const result = score('*Sollozo y digo «No te vayas», luego suspiro*');
  expect(result.reactions.map((part) => part.event)).toEqual(["sob", "sigh"]);
  expect(result.segments.find((part) => part.kind === "dialogue").text).toBe("«No te vayas»");
  expect(result.text).not.toContain("*");
});

it("does not discard deliberately repeated reactions", () => {
  expect(score("*Grito* *Grito*").reactions).toHaveLength(2);
});


it.each([
  ["*Solté un grito de dolor* Ayúdame.", "pain_scream"],
  ["*Me echo a llorar* No te vayas.", "cry"],
  ["*Rompí en llanto* No te vayas.", "cry"],
  ["*Solté una carcajada* Gracias.", "laugh"],
  ["*Dejé escapar un suspiro* Estoy tranquila.", "sigh"],
])("performs whole vocal action phrases without reading broken fragments: %s", (text, event) => {
  const result = score(text);
  expect(result.reactions.map((part) => part.event)).toEqual([event]);
  expect(result.text).not.toMatch(/Solté|Me echo|Rompí|Dejé escapar/);
});
