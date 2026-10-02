import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { episodeStatusLabel } from "@/lib/shortsCatalog";
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
  onUpdated: () => void;
}

export const ShortEpisodeCard = ({
  series,
  episode,
  onUpdated,
}: Props) => {
  const { user } = useAuth();
  const kineva = series.video_provider === "kineva";
  const renderFunction = kineva ? "kineva-video" : "shorts-video";
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(["generating", "assembling"].includes(episode.status));
  const [shotNumber, setShotNumber] = useState(1);
  const [progress, setProgress] = useState("");
  const [reviewWarning, setReviewWarning] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const canPublish = kineva && !series.is_published &&
    series.episodes.length > 0 && series.episodes.every((item) =>
      item.status === "ready" && !!item.video_url);
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
      if (Array.isArray(data?.warnings)) setReviewWarning(data.warnings.length > 0);
      if (typeof data?.total === "number" && data.total > 0) {
        setProgress(`${data.ready ?? 0}/${data.total} tomas listas`);
      }
      if (data?.status === "completed") {
        window.clearInterval(pollRef.current!);
        setGenerating(false);
        setVideoUrl(await getSignedVideoUrl(data.path));
        onUpdated();
      } else if (data?.status === "failed") {
        window.clearInterval(pollRef.current!);
        setGenerating(false);
        toast.error(data.error ?? "No se pudo generar el video");
        onUpdated();
      }
    }, 7000);
  };

  const handleGenerate = async (action: "create" | "repair" = "create") => {
    setGenerating(true);
    const { data, error } = await supabase.functions.invoke(renderFunction, {
      body: { action, episodeId: episode.id, shot: shotNumber },
    });
    if (error || data?.error) {
      setGenerating(false);
      toast.error(
        data?.error === "reference_image_required"
          ? "Este capítulo necesita una imagen de referencia antes de producirse."
          : data?.detail
          ? "El generador rechazó la escena"
          : data?.error || "No se pudo iniciar la generación",
      );
      return;
    }
    if (data?.status === "completed") {
      setReviewWarning(Array.isArray(data?.warnings) && data.warnings.length > 0);
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

  const handlePublish = async () => {
    if (!user || !window.confirm(
      "¿Publicar toda la serie? Revisa antes la imagen, la voz y el audio de cada episodio."
    )) return;
    setPublishing(true);
    const { data, error } = await supabase.rpc("publish_kineva_series", {
      p_series_id: series.id,
    });
    setPublishing(false);
    if (error || !data) {
      toast.error("La serie solo puede publicarse cuando todos los episodios están listos.");
      return;
    }
    toast.success("Serie publicada.");
    onUpdated();
  };

  useEffect(() => {
    if (["generating", "assembling"].includes(episode.status)) poll();
    else if (kineva && episode.status === "ready") {
      supabase.functions.invoke("kineva-video", {
        body: { action: "status", episodeId: episode.id },
      }).then(({ data }) => setReviewWarning(Array.isArray(data?.warnings) && data.warnings.length > 0));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stateLabel = generating ? "En producción" : episodeStatusLabel(episode);

  return (
    <article className="flex flex-col overflow-hidden border border-border bg-card">
      <div className="relative aspect-[9/16] max-h-[520px] bg-muted">
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            className="absolute inset-0 h-full w-full object-cover"
            loop
            playsInline
            controls
            muted={muted}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-accent/20" />
        )}
        {!videoUrl && !generating && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Play className="h-12 w-12 text-primary/40" />
          </div>
        )}
        <span className="absolute left-3 top-3 bg-background/80 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-accent">
          {stateLabel}
        </span>
        {videoUrl && (
          <button
            onClick={() => setMuted((value) => !value)}
            className="absolute right-3 top-3 border border-border bg-background/70 p-2"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        )}
      </div>
      <div className="space-y-3 p-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.25em] text-accent">
            Capítulo {String(episode.episode_number).padStart(2, "0")}
          </p>
          <h3 className="mt-1 font-display text-xl">{episode.title}</h3>
          {episode.script && <p className="mt-2 line-clamp-4 text-sm text-muted-foreground">{episode.script}</p>}
        </div>
        {episode.error_message && (
          <p className="text-sm text-destructive">{episode.error_message}</p>
        )}
        {reviewWarning && kineva && (
          <p className="text-xs text-amber-400">
            Revisa la continuidad visual: Kineva detectó un salto entre cuadros en esta toma.
          </p>
        )}
        {generating && kineva && (
          <p className="text-xs text-accent">{progress || "Kineva preparando tomas…"}</p>
        )}
        {kineva && !series.is_published && series.created_by === user?.id && canPublish && (
          <Button size="sm" variant="outline" onClick={handlePublish} disabled={publishing}>
            {publishing ? "Publicando..." : "Publicar serie revisada"}
          </Button>
        )}
        {!videoUrl && series.created_by === user?.id && (
          <Button className="w-full rounded-none" onClick={() => handleGenerate()} disabled={generating}>
            {generating ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Produciendo capítulo…</>
            ) : (
              <><Sparkles className="mr-2 h-4 w-4" /> Producir este capítulo</>
            )}
          </Button>
        )}
        {videoUrl && kineva && series.created_by === user?.id && (
          <div className="flex items-center gap-2">
            <label htmlFor={`shot-${episode.id}`} className="sr-only">Número de toma</label>
            <input id={`shot-${episode.id}`} type="number" min={1}
              max={episode.kineva_shot_count ?? 1} value={shotNumber}
              onChange={(event) => setShotNumber(Math.max(1, Math.min(
                episode.kineva_shot_count ?? 1, Number(event.target.value) || 1)))}
              className="w-12 border border-border bg-background text-center text-sm" />
            <Button size="sm" variant="outline" onClick={() => handleGenerate("repair")} disabled={generating}>
              {generating ? "Reparando…" : "Regenerar toma"}
            </Button>
          </div>
        )}
      </div>
    </article>
  );
};
