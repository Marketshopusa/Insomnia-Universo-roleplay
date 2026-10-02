import { seriesStatus } from "@/lib/shortsCatalog";
import { Link, useParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Loader2 } from "lucide-react";
import { useShortSeries } from "@/hooks/useShorts";
import { ShortEpisodeCard } from "@/components/shorts/ShortEpisodeCard";
import { SeriesCover } from "@/components/shorts/SeriesCover";

const ShortSeries = () => {
  const { seriesId = "" } = useParams();
  const { series: current, loading, reload } = useShortSeries(seriesId);

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-6">
        <Link to="/shorts" className="text-xs uppercase tracking-[0.2em] text-accent">Volver a las series</Link>
        {loading ? (
          <div className="flex h-[40vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !current ? (
          <div className="py-16 text-center">
            <p className="font-display text-2xl">Esta serie no está en tu catálogo</p>
            <p className="mt-2 text-sm text-muted-foreground">Si era 18+, activa ese modo. Si se creó con otra cuenta, entra con esa sesión.</p>
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-6 md:grid-cols-[220px_1fr] md:items-end">
              <div className="aspect-[4/5] overflow-hidden border border-border bg-muted">
                <SeriesCover series={current} />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-accent">{seriesStatus(current.episodes).label}</p>
                <h1 className="mt-1 font-display text-3xl md:text-4xl">{current.title}</h1>
                {current.premise && <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{current.premise}</p>}
                <p className="mt-3 text-sm">
                  {current.episodes.length
                    ? current.episodes.length + (current.episodes.length === 1 ? " capítulo" : " capítulos") + " de la misma novela, en orden."
                    : "Esta portada no guardó capítulos."}
                  {seriesStatus(current.episodes).key === "written" && " El texto ya está. El video se filma en ComfyUI de esta PC, capítulo por capítulo."}
                  {seriesStatus(current.episodes).key === "producing" && " Si un capítulo se quedó en producción, vuelve a pedirlo: ComfyUI de esta PC lo filma y lo guarda aquí."}
                  {seriesStatus(current.episodes).key === "failed" && " Un capítulo falló. El motivo está debajo de su texto."}
                </p>
              </div>
            </div>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {current.episodes.map((episode) => (
                <ShortEpisodeCard key={episode.id} series={current} episode={episode} onUpdated={reload} />
              ))}
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
};

export default ShortSeries;
