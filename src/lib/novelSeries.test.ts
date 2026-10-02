import { expect, it } from "vitest";
import { seriesDraftFromNovel } from "./novelSeries";

it("keeps every written chapter, in order, inside one novel cover", () => {
  const draft = seriesDraftFromNovel({
    title: "París bajo la lluvia",
    logline: "Él la cubre de la tormenta.",
    chapters: [
      { title: "El toldo", content: "La lluvia cae y él la acerca al toldo.", video_prompt: "rain under an awning" },
      { title: "Vacío", content: "  " },
      { title: "La misma calle", content: "Siguen ahí. No entran a ningún edificio." },
    ],
  }, "idea", false);
  expect(draft.title).toBe("París bajo la lluvia");
  expect(draft.is_adult).toBe(false);
  expect(draft.episodes.map((episode) => episode.title)).toEqual(["El toldo", "La misma calle"]);
  expect(draft.episodes[0].episode_number).toBe(1);
  expect(draft.episodes[1].episode_number).toBe(2);
  expect(draft.episodes[0].script).toContain("toldo");
  expect(draft.episodes[0].status).toBe("pending");
});
