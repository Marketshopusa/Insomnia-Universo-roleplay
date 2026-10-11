import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type Episode = {
  id: string; episode_number: number; title: string; script: string;
  video_prompt: string | null; video_url: string | null; status: string;
};
export type ProductionSeries = {
  id: string; title: string; is_published: boolean;
  kineva_reference_image_path: string | null;
  kineva_bible?: { speakers?: string[] } | null;
  episodes: Episode[];
};
type Review = ProductionSeries & { videos: Record<string, string> };

export function StudioProduction({ userId, refreshKey, onEdit }: {
  userId: string;
  refreshKey?: string;
  onEdit: (series: ProductionSeries, reference: File | null) => void;
}) {
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Review[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from("shorts_series")
      .select("id,title,is_published,kineva_reference_image_path,kineva_bible,episodes:shorts_episodes(id,episode_number,title,script,video_prompt,video_url,status)")
      .eq("created_by", userId).eq("is_published", false).eq("video_provider", "kineva")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const results = await Promise.all((data || []).map(async (row) => {
      const series = row as unknown as ProductionSeries;
      const episodes = [...(series.episodes || [])].sort((a, b) => a.episode_number - b.episode_number);
      const videos: Record<string, string> = {};
      for (const episode of episodes) {
        if (!episode.video_url) continue;
        const { data: signed } = await supabase.storage.from("shorts-media").createSignedUrl(episode.video_url, 3600);
        if (signed?.signedUrl) videos[episode.id] = signed.signedUrl;
      }
      return { ...series, episodes, videos };
    }));
    setDrafts(results);
  }, [userId]);
  useEffect(() => {
    void load().catch((error) => toast({
      title: "No se pudo abrir Producción", description: error instanceof Error ? error.message : undefined,
      variant: "destructive",
    }));
  }, [load, refreshKey]);

  const edit = async (series: ProductionSeries) => {
    setBusy(series.id);
    try {
      let reference: File | null = null;
      if (series.kineva_reference_image_path) {
        const { data, error } = await supabase.storage.from("kineva-references").download(series.kineva_reference_image_path);
        if (error || !data) throw error || new Error("No se pudo recuperar la foto de referencia.");
        reference = new File([data], "referencia.jpg", { type: data.type || "image/jpeg" });
      }
      onEdit(series, reference);
      document.getElementById("studio-editor")?.scrollIntoView({ behavior: "smooth" });
    } catch (error) {
      toast({ title: "No se pudo abrir para editar", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally { setBusy(null); }
  };
  const publish = async (series: ProductionSeries) => {
    if (!series.episodes.length || series.episodes.some((episode) => episode.status !== "ready" || !episode.video_url)) {
      toast({ title: "Faltan capítulos terminados; edítalos antes de publicar.", variant: "destructive" });
      return;
    }
    setBusy(series.id);
    try {
      const { data, error } = await supabase.from("shorts_series")
        .update({ is_published: true }).eq("id", series.id).eq("created_by", userId)
        .eq("is_published", false).select("id").single();
      if (error || !data) throw error || new Error("La serie ya no está disponible.");
      await load();
      toast({ title: "Serie aprobada y publicada en Shorts." });
    } catch (error) {
      toast({ title: "No se pudo publicar", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally { setBusy(null); }
  };

  return <section id="studio-production" className="rounded-lg border border-border p-5 mb-6 space-y-4" aria-label="Producción privada">
    <div className="flex items-center justify-between gap-2">
      <div><h2 className="text-xl font-medium">Producción</h2>
        <p className="text-sm text-muted-foreground">Borradores privados. Revisa y edita los capítulos aquí; Shorts solo mostrará lo que publiques.</p></div>
      <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={!!busy}>Actualizar</Button>
    </div>
    {!drafts.length && <p className="text-sm text-muted-foreground">Todavía no hay series en producción.</p>}
    {drafts.map((series) => <article key={series.id} className="space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-medium">{series.title}</h3><span className="text-xs text-muted-foreground">Privada · {series.episodes.length} capítulos</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {series.episodes.map((episode) => <div key={episode.id} className="space-y-2 rounded border border-border p-2">
          <p className="text-sm">Capítulo {episode.episode_number}: {episode.title}</p>
          {series.videos[episode.id] ? <video controls preload="metadata" className="w-full rounded" src={series.videos[episode.id]} />
            : <p className="text-xs text-muted-foreground">{episode.status === "ready" ? "Video sin vista previa" : "Pendiente de video"}</p>}
        </div>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={!!busy} onClick={() => void edit(series)}>Editar capítulos</Button>
        <Button type="button" disabled={!!busy || !series.episodes.length || series.episodes.some((episode) => episode.status !== "ready" || !episode.video_url)}
          onClick={() => void publish(series)}>Aprobar y publicar en Shorts</Button>
      </div>
    </article>)}
  </section>;
}
