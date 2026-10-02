import { invokeFunctionWithRetry } from "@/lib/invokeFunction";
import { seriesStatus } from "@/lib/shortsCatalog";
import { useState } from "react";
import { Link } from "react-router-dom";
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
import { useAdultMode } from "@/contexts/AdultModeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useShorts } from "@/hooks/useShorts";
import { uploadKinevaReference } from "@/lib/kinevaReference";
import { SeriesCover } from "@/components/shorts/SeriesCover";
import { Skeleton } from "@/components/ui/skeleton";

const createError = (code: string) => ({
  reference_image_unavailable: "No se pudo usar esa imagen. Prueba con otra foto o crea la serie sin ella.",
  premise_too_short: "Describe la premisa con un poco más de detalle.",
  ai_timeout: "La serie tardó demasiado. Revisa Shorts: puede haber quedado guardada.",
}[code] || code);

const Shorts = () => {
  const { enabled: adultEnabled } = useAdultMode();
  const { user } = useAuth();
  const { series, loading, reload } = useShorts(adultEnabled);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [premise, setPremise] = useState("");
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [category, setCategory] = useState("romance");
  const [isAdult, setIsAdult] = useState(adultEnabled);
  const [episodes, setEpisodes] = useState(3);

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
    try {
      const referencePath = await uploadKinevaReference(user.id, premise, referenceImage);
      const { data, error } = await invokeFunctionWithRetry<{ error?: string; message?: string }>(
        "generate-shorts-series", { premise, category, isAdult, episodes, referencePath });
      if (error || data?.error) throw new Error(createError(data?.message || data?.error || error?.message || "No se pudo generar la serie"));
      toast.success("Serie creada. Entra en la portada para ver los capítulos.");
      setOpen(false);
      setPremise("");
      setReferenceImage(null);
      reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo generar la serie");
    } finally {
      setCreating(false);
    }
  };

  return (
    <MainLayout>
      <div className="border-b border-border">
        <div className="container mx-auto px-4 py-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-accent">Insomnia Shorts</p>
            <h1 className="font-display text-3xl md:text-4xl mt-1">Series</h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl">
              Cada serie tiene su portada. Entra para ver los capítulos en orden.
              {!adultEnabled && " Las series 18+ aparecen al activar ese modo."}
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
                  La IA escribe los capítulos y los guarda dentro de una portada.
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
                <div className="space-y-2">
                  <Label htmlFor="shorts-reference">Imagen de referencia (opcional)</Label>
                  <Input id="shorts-reference" type="file" accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => setReferenceImage(event.target.files?.[0] ?? null)}
                    className="rounded-none" />
                  <p className="text-xs text-muted-foreground">Sin foto, la serie igual se guarda. El video la pide cuando vayas a producirlo.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Categoría</Label>
                    <Input value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-none" />
                  </div>
                  <div className="space-y-2">
                    <Label>Episodios</Label>
                    <Input type="number" min={1} max={6} value={episodes}
                      onChange={(e) => setEpisodes(Number(e.target.value))} className="rounded-none" />
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
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Escribiendo episodios…</>
                  ) : (
                    <><Sparkles className="w-4 h-4 mr-2" /> Generar serie</>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="aspect-[4/5] rounded-none" />)}
          </div>
        ) : series.length === 0 ? (
          <div className="h-[50vh] flex flex-col items-center justify-center text-center gap-3 px-4">
            <p className="font-display text-2xl">Aún no hay series</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              Crea una serie y sus capítulos quedarán juntos, dentro de la portada.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {series.map((item, index) => {
              const status = seriesStatus(item.episodes);
              return (
                <Link key={item.id} to={`/shorts/${item.id}`} className="group relative overflow-hidden border border-border/60 bg-card/60 transition-all duration-300 hover:-translate-y-1 hover:border-primary/60">
                  <div className="relative aspect-[4/5] overflow-hidden bg-muted">
                    <SeriesCover series={item} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                    <div className="absolute bottom-0 right-0 border-l border-t border-border/60 bg-background/80 px-2.5 py-1">
                      <span className="font-display text-xs italic text-accent">N°{String(index + 1).padStart(2, "0")}</span>
                    </div>
                    {item.is_adult && (
                      <span className="absolute top-2 left-2 text-[10px] px-2 py-1 bg-destructive/80 text-destructive-foreground">18+</span>
                    )}
                  </div>
                  <div className="space-y-1 p-3">
                    <h2 className="font-display text-base leading-tight line-clamp-2 group-hover:text-primary">{item.title}</h2>
                    <p className="text-[11px] text-muted-foreground">
                      {item.episodes.length} {item.episodes.length === 1 ? "capítulo" : "capítulos"} · {status.label}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default Shorts;
