import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SeriesWithEpisodes } from "@/hooks/useShorts";

export function SeriesCover({ series, className = "h-full w-full object-cover" }: { series: SeriesWithEpisodes; className?: string }) {
  const [src, setSrc] = useState<string | null>(series.cover_url);
  const [video, setVideo] = useState(false);

  useEffect(() => {
    let alive = true;
    const poster = series.episodes.find((episode) => episode.poster_url)?.poster_url || null;
    const clip = series.episodes.find((episode) => episode.video_url)?.video_url || null;
    const apply = (url: string | null, asVideo: boolean) => {
      if (!alive) return;
      setSrc(url);
      setVideo(asVideo);
    };
    if (series.cover_url) {
      apply(series.cover_url, false);
      return () => { alive = false; };
    }
    if (poster) {
      apply(poster, false);
      return () => { alive = false; };
    }
    const sign = async () => {
      if (clip) {
        const signed = clip.startsWith("http")
          ? clip
          : (await supabase.storage.from("shorts-media").createSignedUrl(clip, 60 * 60)).data?.signedUrl;
        if (signed) {
          apply(signed, true);
          return;
        }
      }
      const path = series.kineva_reference_image_path;
      if (!path) {
        apply(null, false);
        return;
      }
      const image = (await supabase.storage.from("kineva-references").createSignedUrl(path, 60 * 60)).data?.signedUrl;
      apply(image || null, false);
    };
    void sign();
    return () => { alive = false; };
  }, [series]);

  if (src && video) {
    return <video src={src} className={className} muted loop playsInline autoPlay />;
  }
  if (src) return <img src={src} alt={series.title} className={className} />;
  return (
    <div className="flex h-full w-full items-end bg-gradient-to-br from-primary/30 via-background to-accent/20 p-4">
      <p className="font-display text-xl leading-tight">{series.title}</p>
    </div>
  );
}
