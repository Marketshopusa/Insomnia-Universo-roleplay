import { supabase } from "@/integrations/supabase/client";
import { seriesDraftFromNovel, type NovelChapterInput } from "@/lib/novelSeries";

export async function saveNovelSeries(input: {
  userId: string;
  novel: { title?: string; logline?: string; chapters?: NovelChapterInput[] };
  description: string;
  isAdult: boolean;
  referencePath?: string | null;
}) {
  const draft = seriesDraftFromNovel(input.novel, input.description, input.isAdult);
  if (!draft.episodes.length) throw new Error("La novela no trajo capítulos para guardar.");
  const { data: series, error } = await supabase.from("shorts_series").insert({
    title: draft.title,
    premise: draft.premise,
    category: draft.category,
    is_adult: draft.is_adult,
    created_by: input.userId,
    video_provider: "kineva",
    is_published: false,
    kineva_reference_image_path: input.referencePath || null,
    kineva_bible: { language: "Spanish" },
  }).select("id").single();
  if (error || !series) throw new Error(error?.message || "No se pudo guardar la novela.");
  const { data: episodes, error: episodeError } = await supabase.from("shorts_episodes").insert(
    draft.episodes.map((episode) => ({ ...episode, series_id: series.id })),
  ).select("id, episode_number");
  if (episodeError || !episodes?.length) throw new Error(episodeError?.message || "No se pudieron guardar los capítulos.");
  const ordered = [...episodes].sort((a, b) => a.episode_number - b.episode_number);
  return { seriesId: series.id, episodeIds: ordered.map((episode) => episode.id), title: draft.title };
}
