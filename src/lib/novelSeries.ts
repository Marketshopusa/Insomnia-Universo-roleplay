export interface NovelChapterInput {
  title?: string;
  content?: string;
  video_prompt?: string;
}

export interface NovelSeriesDraft {
  title: string;
  premise: string;
  category: "novela";
  is_adult: boolean;
  episodes: Array<{
    episode_number: number;
    title: string;
    script: string;
    video_prompt: string;
    status: "pending";
  }>;
}

/** One cover keeps the whole novel. Each chapter is stored in order, in full. */
export function seriesDraftFromNovel(
  novel: { title?: string; logline?: string; chapters?: NovelChapterInput[] },
  description: string,
  isAdult: boolean,
): NovelSeriesDraft {
  const episodes = (novel.chapters || [])
    .map((chapter) => ({
      title: String(chapter.title || "").trim(),
      script: String(chapter.content || "").trim(),
      video_prompt: String(chapter.video_prompt || "").trim(),
    }))
    .filter((chapter) => chapter.script.length >= 5)
    .slice(0, 20)
    .map((chapter, index) => ({
      episode_number: index + 1,
      title: (chapter.title || "Capítulo " + (index + 1)).slice(0, 120),
      script: chapter.script.slice(0, 8000),
      video_prompt: chapter.video_prompt.slice(0, 900),
      status: "pending" as const,
    }));
  return {
    title: String(novel.title || "Novela sin título").slice(0, 120),
    premise: String(novel.logline || description).slice(0, 500),
    category: "novela",
    is_adult: isAdult,
    episodes,
  };
}
