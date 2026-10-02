import { expect, it, vi } from "vitest";
import { publishLocalChapters } from "./chapterVideo";
import type { LocalJob } from "./kinevaLocal";

it("stores each finished ComfyUI clip on the matching chapter", async () => {
  const ready: LocalJob = {
    id: "job-1",
    state: "completed",
    current: 2,
    total: 2,
    error: null,
    videos: [
      { episode: 1, url: "/videos/job-1/a.mp4" },
      { episode: 2, url: "/videos/job-1/b.mp4" },
    ],
  };
  const upload = vi.fn(async (episodeId: string) => "episodes/" + episodeId + "/local/clip.mp4");
  const markReady = vi.fn(async () => undefined);
  const fetchVideo = vi.fn(async (url: string) => {
    expect(url).toContain("http://127.0.0.1:8787/videos/job-1/");
    return new Blob(["video"]);
  });
  await publishLocalChapters({
    chapters: ["Llueve en la calle.", "Siguen bajo el toldo."],
    episodeIds: ["ep-1", "ep-2"],
    createJob: async () => ready,
    fetchJob: async () => ready,
    fetchVideo,
    upload,
    markReady,
    pause: async () => undefined,
  });
  expect(upload.mock.calls.map((call) => call[0])).toEqual(["ep-1", "ep-2"]);
  expect(markReady).toHaveBeenCalledWith("ep-1", "episodes/ep-1/local/clip.mp4");
  expect(markReady).toHaveBeenCalledWith("ep-2", "episodes/ep-2/local/clip.mp4");
});
