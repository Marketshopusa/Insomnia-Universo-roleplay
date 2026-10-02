import { expect, it } from "vitest";
import { novelFromProject } from "./novelProject";

it("restores the three chapters that were saved with the novel", () => {
  const novel = novelFromProject({
    title: "La carta",
    description: "Ella vuelve al hotel.",
    content: "## 1. La barra\n\nÉl sigue ahí.\n\n## 2. La carta\n\nLa lee en voz baja.\n\n## 3. La lluvia\n\nSalen juntos.",
    outline: "Tres noches.\n\n<!-- BIBLE\n{\"characters\":[{\"name\":\"Lena\"}],\"setting\":{\"place\":\"hotel\"}}\n-->",
  });
  expect(novel.chapters.map((chapter) => chapter.title)).toEqual(["La barra", "La carta", "La lluvia"]);
  expect(novel.chapters[1].content).toBe("La lee en voz baja.");
  expect(novel.characters[0].name).toBe("Lena");
  expect(novel.setting?.place).toBe("hotel");
  expect(novel.outline).toBe("Tres noches.");
});

it("says a project has no chapters when the text was not stored", () => {
  const novel = novelFromProject({ title: "Proyecto sin título", description: "Una idea" });
  expect(novel.chapters).toEqual([]);
});
