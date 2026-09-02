import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ShortsSeries {
  id: string;
  title: string;
  premise: string | null;
  category: string;
  is_adult: boolean;
  cover_url: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ShortsEpisode {
  id: string;
  series_id: string;
  episode_number: number;
  title: string;
  script: string;
  video_prompt: string | null;
  video_url: string | null;
  status: string;
  error_message: string | null;
}

export interface SeriesWithEpisodes extends ShortsSeries {
  episodes: ShortsEpisode[];
}

export const getSignedVideoUrl = async (path: string | null) => {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = await supabase.storage.from("shorts-media").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
};

export const useShorts = (adultEnabled: boolean) => {
  const [series, setSeries] = useState<SeriesWithEpisodes[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("shorts_series")
      .select("*, episodes:shorts_episodes(*)")
      .order("created_at", { ascending: false });

    if (!adultEnabled) query = query.eq("is_adult", false);

    const { data, error } = await query;
    if (!error && data) {
      setSeries(
        (data as unknown as SeriesWithEpisodes[]).map((s) => ({
          ...s,
          episodes: [...(s.episodes ?? [])].sort((a, b) => a.episode_number - b.episode_number),
        })),
      );
    }
    setLoading(false);
  }, [adultEnabled]);

  useEffect(() => {
    load();
  }, [load]);

  return { series, loading, reload: load };
};
