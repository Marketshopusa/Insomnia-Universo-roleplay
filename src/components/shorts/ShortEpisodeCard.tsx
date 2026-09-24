import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Play, Sparkles, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import {
  getSignedVideoUrl,
  type SeriesWithEpisodes,
  type ShortsEpisode,
} from "@/hooks/useShorts";

interface Props {
  series: SeriesWithEpisodes;
  episode: ShortsEpisode;
  active: boolean;
  onUpdated: () => void;
}

export const ShortEpisodeCard = ({
  series,
  episode,
  active,
  onUpdated,
}: Props) => {
  const { user } = useAuth();
  const kineva = series.video_provider === "kineva";
  const renderFunction = kineva ? "kineva-video" : "shorts-video";
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(episode.status === "generating");
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    getSignedVideoUrl(episode.video_url).then((url) => {
      if (alive) setVideoUrl(url);
    });
    return () => {
      alive = false;
    };
  }, [episode.video_url]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (active) el.play().catch(() => undefined);
    else el.pause();
  }, [active, videoUrl]);

  useEffect(
    () => () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    },
    [],
  );

  const poll = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      const { data, error } = await supabase.functions.invoke(renderFunction, {
        body: { action: "status", episodeId: episode.id },
      });
      if (error) return;
      if (data?.status === "completed") {
        window.clearInterval(pollRef.current!);
        setGenerating(false);
        setVideoUrl(await getSignedVideoUrl(data.path));
        onUpdated();
      } else if (data?.status === "failed") {
        window.clearInterval(pollRef.current!);
        setGenerating(false);
        toast.error(data.error ?? "No se pudo generar el video");
      }
    }, 7000);
  };

  const handleGenerate = async (action: "create" | "repair" = "create") => {
    setGenerating(true);
    const { data, error } = await supabase.functions.invoke(renderFunction, {
      body: { action, episodeId: episode.id },
    });
    if (error || data?.error) {
      setGenerating(false);
      toast.error(
        data?.detail
          ? "El generador rechazó la escena"
          : "No se pudo iniciar la generación",
      );
      return;
    }
    if (data?.status === "completed") {
      setGenerating(false);
      setVideoUrl(await getSignedVideoUrl(data.path));
      onUpdated();
      return;
    }
    toast.info(
      kineva
        ? "Kineva ha puesto la toma en cola. Puede tardar bastante tiempo."
        : "Generando episodio...",
    );
    poll();
  };

  useEffect(() => {
    if (episode.status === "generating" && !episode.video_url) poll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="h-[calc(100vh-4rem)] snap-start snap-always flex items-center justify-center px-4 py-4">
      <div className="relative w-full max-w-[420px] h-full overflow-hidden border border-border bg-card">
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            className="absolute inset-0 w-full h-full object-cover"
            loop
            playsInline
            muted={muted}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-accent/20" />
        )}

        <div className="absolute inset-x-0 bottom-0 p-5 bg-gradient-to-t from-background via-background/85 to-transparent">
          <p className="text-[11px] uppercase tracking-[0.25em] text-accent">
            {series.title} · N°{String(episode.episode_number).padStart(2, "0")}
          </p>
          <h3 className="font-display text-2xl mt-1">{episode.title}</h3>

          {!videoUrl && series.created_by === user?.id && (
            <Button
              className="mt-4 w-full rounded-none"
              onClick={() => handleGenerate()}
              disabled={generating}
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generando
                  episodio…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" /> Generar video del
                  episodio
                </>
              )}
            </Button>
          )}
        </div>

        {videoUrl && kineva && series.created_by === user?.id && (
          <Button
            className="absolute top-4 left-4 rounded-none"
            size="sm"
            variant="outline"
            onClick={() => handleGenerate("repair")}
            disabled={generating}
          >
            {generating ? "Reparando…" : "Regenerar toma"}
          </Button>
        )}

        {videoUrl && (
          <button
            onClick={() => setMuted((m) => !m)}
            className="absolute top-4 right-4 p-2 bg-background/70 border border-border"
          >
            {muted ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
        )}

        {series.is_adult && (
          <span className="absolute top-4 left-4 text-[10px] px-2 py-1 bg-destructive/20 border border-destructive/40 text-destructive">
            18+
          </span>
        )}

        {!videoUrl && !generating && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Play className="w-12 h-12 text-primary/40" />
          </div>
        )}
      </div>
    </section>
  );
};
