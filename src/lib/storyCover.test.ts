import { describe, expect, it } from "vitest";
import { resolveStoryCover } from "./storyCover";

describe("story cover shown on both card and chat", () => {
  it("uses a personal replacement for an existing story", () => {
    expect(resolveStoryCover("old-image.jpg", "new-video.mp4")).toBe("new-video.mp4");
  });
  it("falls back to the story cover for the owner or a new visitor", () => {
    expect(resolveStoryCover("current-image.jpg", null)).toBe("current-image.jpg");
    expect(resolveStoryCover(null, null)).toBeNull();
  });
});
