import { useEffect, useMemo, useRef, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdultMode } from "@/contexts/AdultModeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useShorts } from "@/hooks/useShorts";
import { ShortEpisodeCard } from "@/components/shorts/ShortEpisodeCard";

const Shorts = () => {
  const { enabled: adultEnabled } = useAdultMode();
  const { user } = useAuth();
  const { series, loading, reload } = useShorts(adultEnabled);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [premise, setPremise] = useState("");
  const [category, setCategory] = useState("romance");
  const [isAdult, setIsAdult] = useState(adultEnabled);
  const [episodes, setEpisodes] = useState(3);
  const [activeId, setActiveId] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  const items = useMemo(
    () => series.flatMap((s) => s.episodes.map((e) => ({ series: s, episode: e }))),
    [series],
  );

  useEffect(() => {
    const root = feedRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveId((entry.target as HTMLElement).dataset.id ?? null);
        });
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll("[data-id]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  const handleCreate = async () => {
    if (!user) {
      toast.error("Inicia sesión para crear una serie");
      return;
    }
    if (premise.trim().length < 10) {
      toast.error("Describe la premisa con un poco más de detalle");
      return;
    }
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("generate-shorts-series", {
      body: { premise, category, isAdult, episodes },
    });
    setCreating(false);
    if (error || data?.error) {
      toast.error("No se pudo generar la serie");
      return;
    }
    toast.success("Serie creada. Genera el video de cada episodio.");
    setOpen(false);
    setPremise("");
    reload();
  };

  return (
    <MainLayout>
      <div className="border-b border-border">
        <div className="container mx-auto px-4 py-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-accent">Insomnia Shorts</p>
            <h1 className="font-display text-3xl md:text-4xl mt-1">Series verticales generadas por IA</h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl">
              Micro-episodios cinematográficos de 10 segundos. Desliza para continuar la historia.
            </p>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-none">
                <Plus className="w-4 h-4 mr-2" /> Nueva serie
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-none">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">Crear serie de shorts</DialogTitle>
                <DialogDescription>
                  La IA escribe los episodios y genera el video vertical de cada uno.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Premisa</Label>
                  <Textarea
                    value={premise}
                    onChange={(e) => setPremise(e.target.value)}
                    rows={4}
                    className="rounded-none"
                    placeholder="Ella vuelve al hotel donde lo dejó hace diez años, y él sigue tras la barra…"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Categoría</Label>
                    <Input
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="rounded-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Episodios</Label>
                    <Input
                      type="number"
                      min={1}
                      max={6}
                      value={episodes}
                      onChange={(e) => setEpisodes(Number(e.target.value))}
                      className="rounded-none"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Contenido 18+</p>
                    <p className="text-xs text-muted-foreground">Tensión adulta insinuada, sin explícito</p>
                  </div>
                  <Switch checked={isAdult} onCheckedChange={setIsAdult} />
                </div>
                <Button className="w-full rounded-none" onClick={handleCreate} disabled={creating}>
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Escribiendo episodios…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" /> Generar serie
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="h-[60vh] flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="h-[60vh] flex flex-col items-center justify-center text-center gap-3 px-4">
          <p className="font-display text-2xl">Aún no hay shorts</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            Crea la primera serie y la IA escribirá los episodios y generará el video vertical de cada uno.
          </p>
        </div>
      ) : (
        <div
          ref={feedRef}
          className="h-[calc(100vh-4rem)] overflow-y-auto snap-y snap-mandatory scrollbar-none"
        >
          {items.map(({ series: s, episode }) => (
            <div key={episode.id} data-id={episode.id}>
              <ShortEpisodeCard
                series={s}
                episode={episode}
                active={activeId === episode.id}
                onUpdated={reload}
              />
            </div>
          ))}
        </div>
      )}
    </MainLayout>
  );
};

export default Shorts;
