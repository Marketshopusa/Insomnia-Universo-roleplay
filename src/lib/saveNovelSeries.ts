import { supabase } from "@/integrations/supabase/client";
import { seriesDraftFromNovel, type NovelChapterInput } from "@/lib/novelSeries";

export async function saveNovelSeries(input: {
  userId: string;
  novel: { title?: string; logline?: string; chapters?: NovelChapterInput[] };
  description: string;
  isAdult: boolean;
  referencePath?: string | null;
  speakers?: string[];
  lines?: string[];
  existingSeriesId?: string | null;
}) {
  const draft = seriesDraftFromNovel(input.novel, input.description, input.isAdult);
  if (!draft.episodes.length) throw new Error("La novela no trajo capítulos para guardar.");
  const authorKey = input.userId;
  const seriesRow: Record<string, any> = {
    title: draft.title,
    premise: draft.premise,
    category: draft.category,
    is_adult: draft.is_adult,
    video_provider: "kineva",
    kineva_bible: { language: "Spanish", speakers: input.speakers || [], lines: input.lines || [] },
  };
  if (input.referencePath !== undefined) {
    seriesRow.kineva_reference_image_path = input.referencePath || null;
  }

  let seriesId = input.existingSeriesId;
  if (seriesId) {
    const { error: updateError } = await supabase
      .from("shorts_series")
      .update(seriesRow)
      .eq("id", seriesId)
      .eq("created_by", authorKey);
    if (updateError) throw new Error(updateError.message);
  } else {
    seriesRow.created_by = authorKey;
    seriesRow.is_published = false;
    const { data: series, error } = await supabase.from("shorts_series").insert(seriesRow).select("id").single();
    if (error || !series) throw new Error(error?.message || "No se pudo guardar la novela.");
    seriesId = series.id;
  }

  // Sync episodes: update existing numbers or insert new
  const { data: existingEpisodes } = await supabase
    .from("shorts_episodes")
    .select("id, episode_number")
    .eq("series_id", seriesId);

  const existingMap = new Map((existingEpisodes || []).map((e: any) => [e.episode_number, e.id]));
  const episodeIds: string[] = [];

  for (const episode of draft.episodes) {
    const existingId = existingMap.get(episode.episode_number);
    if (existingId) {
      await supabase
        .from("shorts_episodes")
        .update({
          title: episode.title,
          script: episode.script,
          video_prompt: episode.video_prompt,
          is_adult: episode.is_adult,
        })
        .eq("id", existingId);
      episodeIds.push(existingId);
    } else {
      const { data: newEp } = await supabase
        .from("shorts_episodes")
        .insert({ ...episode, series_id: seriesId })
        .select("id")
        .single();
      if (newEp?.id) episodeIds.push(newEp.id);
    }
  }

  return { seriesId, episodeIds, title: draft.title };
}
