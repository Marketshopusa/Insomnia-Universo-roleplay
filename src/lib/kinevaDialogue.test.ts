import { describe, expect, it } from "vitest";
import { splitKinevaDialogue } from "./kinevaDialogue";

describe("splitKinevaDialogue", () => {
  it("preserves every word of a long spoken line across supported shots", () => {
    const line = "Le hablamos a las personas sobre lo rápido que podemos crear una página web sencilla a un costo económico a partir de 150 dólares. Y mostramos varios modelos de páginas para elegir.";
    const shots = splitKinevaDialogue(line);
    expect(shots).toHaveLength(2);
    expect(shots.every((shot) => shot.split(/\s+/).length <= 20)).toBe(true);
    expect(shots.join(" ")).toBe(line);
  });

  it("permits a scene without speech", () => {
    expect(splitKinevaDialogue("")).toEqual([""]);
  });
});
