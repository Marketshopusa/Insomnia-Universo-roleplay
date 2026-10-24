import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Trash2, RefreshCw, Loader2, Edit3, CheckCircle2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Episode = {
  id: string; episode_number: number; title: string; script: string;
  video_prompt: string | null; video_url: string | null; status: string;
};

export type ProductionSeries = {
  id: string; title: string; is_published: boolean;
  kineva_reference_image_path: string | null;
  kineva_bible?: { speakers?: string[]; lines?: string[] } | null;
  episodes: Episode[];
};

type Review = ProductionSeries & { videos: Record<string, string> };

export function StudioProduction({ userId, refreshKey, onEdit, onDelete }: {
  userId: string;
  refreshKey?: string;
  onEdit: (series: ProductionSeries, reference: File | null) => void;
  onDelete?: (seriesId: string) => void;
}) {
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Review[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await (supabase.from("shorts_series") as any)
      .select("id,title,is_published,kineva_reference_image_path,kineva_bible,episodes:shorts_episodes(id,episode_number,title,script,video_prompt,video_url,status)")
      .eq("created_by", userId).eq("is_published", false).eq("video_provider", "kineva")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const results = await Promise.all((data || []).map(async (row) => {
      const series = row as unknown as ProductionSeries;
      const episodes = [...(series.episodes || [])].sort((a, b) => a.episode_number - b.episode_number);
      const signedEntries = await Promise.all(
        episodes.map(async (episode) => {
          if (!episode.video_url) return null;
          const { data: signed } = await supabase.storage.from("shorts-media").createSignedUrl(episode.video_url, 3600);
          return signed?.signedUrl ? ([episode.id, signed.signedUrl] as const) : null;
        }),
      );
      const videos = Object.fromEntries(signedEntries.filter((entry): entry is readonly [string, string] => entry !== null));
      return { ...series, episodes, videos };
    }));
    setDrafts(results);
  }, [userId]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await load();
      toast({ title: "Producción actualizada", description: "Se sincronizaron los borradores privados." });
    } catch (error) {
      toast({
        title: "No se pudo actualizar",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void load().catch((error) => toast({
      title: "No se pudo abrir Producción", description: error instanceof Error ? error.message : undefined,
      variant: "destructive",
    }));
  }, [load, refreshKey, toast]);

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
      const authorKey = userId;
      const publishPatch = { is_published: true };
      const { data, error } = await supabase.from("shorts_series")
        .update(publishPatch).eq("id", series.id).eq("created_by", authorKey)
        .eq("is_published", false).select("id").single();
      if (error || !data) throw error || new Error("La serie ya no está disponible.");
      await load();
      toast({ title: "Serie aprobada y publicada en Shorts." });
    } catch (error) {
      toast({ title: "No se pudo publicar", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const deleteSeries = async (series: ProductionSeries) => {
    setBusy(series.id);
    try {
      // 1. Limpiar archivos multimedia de storage si existen
      const videoPaths = series.episodes
        .map((e) => e.video_url)
        .filter((url): url is string => Boolean(url && !url.startsWith("http")));
      if (videoPaths.length > 0) {
        try {
          await supabase.storage.from("shorts-media").remove(videoPaths);
        } catch { /* ignorar limpieza de storage si ya no existían */ }
      }
      if (series.kineva_reference_image_path) {
        try {
          await supabase.storage.from("kineva-references").remove([series.kineva_reference_image_path]);
        } catch { /* ignorar */ }
      }

      // 2. Eliminar episodios
      await supabase.from("shorts_episodes").delete().eq("series_id", series.id);

      // 3. Eliminar la serie principal
      const { error } = await supabase.from("shorts_series").delete().eq("id", series.id).eq("created_by", userId);
      if (error) throw error;

      // 4. Limpiar sesión si esta serie estaba activa en memoria
      try {
        const storedIds = window.sessionStorage.getItem("insomnia.studio.episodeIds");
        if (storedIds) {
          const parsed = JSON.parse(storedIds);
          if (Array.isArray(parsed) && series.episodes.some((e) => parsed.includes(e.id))) {
            window.sessionStorage.removeItem("insomnia.studio.episodeIds");
          }
        }
      } catch { /* ignore */ }

      // 5. Actualizar estado y avisar al padre
      setDrafts((prev) => prev.filter((d) => d.id !== series.id));
      onDelete?.(series.id);
      toast({ title: "Borrador eliminado", description: `Se eliminó "${series.title}" de producción.` });
    } catch (error) {
      toast({
        title: "No se pudo eliminar el borrador",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section id="studio-production" className="rounded-lg border border-border p-5 mb-6 space-y-4" aria-label="Producción privada">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-medium">Producción</h2>
          <p className="text-sm text-muted-foreground">Borradores privados. Revisa y edita los capítulos aquí; Shorts solo mostrará lo que publiques.</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void handleRefresh()}
          disabled={isRefreshing || !!busy}
          className="gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          {isRefreshing ? "Actualizando…" : "Actualizar"}
        </Button>
      </div>

      {!drafts.length && <p className="text-sm text-muted-foreground">Todavía no hay series en producción.</p>}

      {drafts.map((series) => (
        <article key={series.id} className="space-y-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-base">{series.title}</h3>
              <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-muted/60">Privada · {series.episodes.length} capítulos</span>
            </div>

            {/* Botón de eliminación con confirmación modal */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy === series.id}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5 text-xs h-8"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Eliminar borrador
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar este borrador de producción?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se eliminará permanentemente la serie <span className="font-semibold text-foreground">"{series.title}"</span> con sus {series.episodes.length} capítulos y videos pendientes. Esta acción no se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => void deleteSeries(series)}
                  >
                    Sí, eliminar borrador
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {series.episodes.map((episode) => (
              <div key={episode.id} className="space-y-2 rounded border border-border p-2.5 bg-card/40">
                <p className="text-xs font-medium text-foreground">Capítulo {episode.episode_number}: {episode.title}</p>
                {series.videos[episode.id] ? (
                  <video controls preload="metadata" className="w-full rounded aspect-[9/16] object-cover bg-black" src={series.videos[episode.id]} />
                ) : (
                  <div className="p-3 rounded bg-muted/30 text-center">
                    <p className="text-xs text-muted-foreground">
                      {episode.status === "ready" ? "Video listo sin vista previa" : "Pendiente de video"}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy === series.id}
              onClick={() => void edit(series)}
              className="gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Editar capítulos
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={
                busy === series.id ||
                !series.episodes.length ||
                series.episodes.some((episode) => episode.status !== "ready" || !episode.video_url)
              }
              onClick={() => void publish(series)}
              className="gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Aprobar y publicar en Shorts
            </Button>
          </div>
        </article>
      ))}
    </section>
  );
}
