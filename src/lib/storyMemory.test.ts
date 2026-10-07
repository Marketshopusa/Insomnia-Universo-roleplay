import { expect, it } from "vitest";
import { selectStoryMemory, type StoryTurn } from "./storyMemory";

it("recalls a related fact beyond 48 turns and keeps the old actor", () => {
  const turns: StoryTurn[] = [{ role: "user", content: "Entramos a la biblioteca." }];
  for (let index = 0; index < 70; index += 1) {
    turns.push({ role: "user", content: index === 7
      ? "Pedrito escondió la llave azul bajo la maceta."
      : `Hablamos del capítulo ${index} cerca de la puerta.` });
    turns.push({ role: "assistant", content: `Te escucho, capítulo ${index}.` });
  }
  const recalled = selectStoryMemory(turns, "¿Dónde escondió Pedrito la llave azul?");
  expect(recalled.some((turn) => turn.role === "user" && turn.content.includes("maceta"))).toBe(true);
  expect(recalled[0].content).toContain("biblioteca");
  expect(recalled.length).toBeLessThanOrEqual(8);
  expect(recalled.every((turn) => turn.content.length <= 240)).toBe(true);
});

it("keeps a relevant fact near the end of a long older turn", () => {
  const fact = "Clara guardó el sobre en la caja verde.";
  const oldTurn = "Hablamos de nuestro viaje por la costa. ".repeat(5) + fact;
  const history: StoryTurn[] = [
    { role: "user", content: oldTurn },
    ...Array.from({ length: 60 }, (_, i) => ({ role: "assistant" as const, content: `Pasó el día ${i}.` })),
  ];
  const recalled = selectStoryMemory(history, "¿Dónde quedó el sobre que guardó Clara?");
  expect(recalled[0].content).toContain(fact);
});

it("keeps separate story histories and adds no recall for a short chat", () => {
  expect(selectStoryMemory([{ role: "user", content: "El tren va a Sevilla." }], "¿Dónde?")).toEqual([]);
  const one: StoryTurn[] = [{ role: "user", content: "Andrea vive en Caracas." }, ...Array.from(
    { length: 50 }, () => ({ role: "assistant" as const, content: "Seguimos hablando." }),
  )];
  const two: StoryTurn[] = [{ role: "user", content: "Mara vive en Bogotá." }, ...Array.from(
    { length: 50 }, () => ({ role: "assistant" as const, content: "Seguimos hablando." }),
  )];
  expect(selectStoryMemory(one, "¿Dónde vive Andrea?")[0].content).toContain("Caracas");
  expect(selectStoryMemory(two, "¿Dónde vive Mara?")[0].content).toContain("Bogotá");
});
