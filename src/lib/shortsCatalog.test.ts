import { expect, it } from "vitest";
import { episodeStatusLabel, seriesStatus } from "./shortsCatalog";

it("shows a written series separately from one still in production or failed", () => {
  expect(seriesStatus([
    { status: "pending" },
    { status: "pending" },
    { status: "pending" },
  ]).label).toBe("Guion listo");
  expect(seriesStatus([
    { status: "ready", video_url: "a.mp4" },
    { status: "generating" },
  ]).label).toBe("En producción");
  expect(seriesStatus([
    { status: "pending", error_message: "assembly_failed" },
  ]).label).toBe("Falló");
  expect(seriesStatus([
    { status: "ready", video_url: "a.mp4" },
    { status: "ready", video_url: "b.mp4" },
  ]).label).toBe("Lista");
  expect(episodeStatusLabel({ status: "pending" })).toBe("Sin video");
});
