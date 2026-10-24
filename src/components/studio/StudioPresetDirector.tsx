import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STUDIO_PRESETS, PRESET_ARCS, type StudioPreset, type StudioGenre } from "@/lib/studioPresets";
import { Sparkles, Clapperboard, Flame, Heart, Check, Ghost, Trophy, Crosshair } from "lucide-react";

interface StudioPresetDirectorProps {
  onApplyScene: (chapterIndex: number, visualPrompt: string, suggestedLine: string) => void;
  onApplyArc: (arcTitle: string, chapters: { visual: string; line: string }[]) => void;
  initialCategory?: "sfw" | "nsfw";
  chapterCount?: number;
  activeGenre?: StudioGenre;
  onGenreSelect?: (genre: StudioGenre) => void;
}

const GENRE_DEFINITIONS: { id: StudioGenre; label: string; icon: any; color: string }[] = [
  { id: "adult", label: "Adulto / NSFW", icon: Flame, color: "text-primary" },
  { id: "romance", label: "Romance / Drama", icon: Heart, color: "text-rose-500" },
  { id: "horror", label: "Terror / Suspenso", icon: Ghost, color: "text-purple-400" },
  { id: "sports", label: "Deportivo", icon: Trophy, color: "text-amber-400" },
  { id: "action", label: "Acción", icon: Crosshair, color: "text-red-500" },
];

export function StudioPresetDirector({
  onApplyScene,
  onApplyArc,
  initialCategory = "nsfw",
  chapterCount = 3,
  activeGenre,
  onGenreSelect,
}: StudioPresetDirectorProps) {
  const [internalGenre, setInternalGenre] = useState<StudioGenre>(
    activeGenre || (initialCategory === "nsfw" ? "adult" : "romance")
  );
  const currentGenre = activeGenre || internalGenre;

  const handleGenreChange = (newGenre: StudioGenre) => {
    setInternalGenre(newGenre);
    onGenreSelect?.(newGenre);
  };

  const [selectedPreset, setSelectedPreset] = useState<StudioPreset | null>(null);
  const [appliedChapter, setAppliedChapter] = useState<{ chapter: number; presetId: string } | null>(null);

  const presets = STUDIO_PRESETS.filter((p) => (p.genre || (p.category === "nsfw" ? "adult" : "romance")) === currentGenre);

  const handleApplyToChapter = (chapterIndex: number, preset: StudioPreset) => {
    onApplyScene(chapterIndex, preset.visualPrompt, preset.suggestedLine);
    setAppliedChapter({ chapter: chapterIndex, presetId: preset.id });
    setTimeout(() => setAppliedChapter(null), 2500);
  };

  const handleApplyFullArc = (arcKey: keyof typeof PRESET_ARCS, arcName: string) => {
    const arc = PRESET_ARCS[arcKey];
    if (!arc) return;
    const fullChapters = arc.map((item) => {
      const preset = STUDIO_PRESETS.find((p) => p.id === item.presetId);
      return {
        visual: preset ? preset.visualPrompt : item.title,
        line: preset ? preset.suggestedLine : "",
      };
    });
    onApplyArc(arcName, fullChapters);
  };

  const totalChapters = Math.max(1, chapterCount);

  return (
    <div className="rounded-xl border border-border bg-card/60 backdrop-blur p-4 space-y-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clapperboard className="h-5 w-5 text-accent" />
          <h3 className="font-semibold text-base">Director de Escenas y Poses Multi-Género</h3>
          <Badge variant="outline" className="text-xs">
            {totalChapters} {totalChapters === 1 ? "Capítulo" : "Capítulos"}
          </Badge>
        </div>

        {/* Selector de Género Adaptativo */}
        <div className="flex flex-wrap items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border text-xs">
          {GENRE_DEFINITIONS.map((def) => {
            const Icon = def.icon;
            const isCurrent = currentGenre === def.id;
            return (
              <button
                key={def.id}
                type="button"
                onClick={() => handleGenreChange(def.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-all ${
                  isCurrent
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isCurrent ? "" : def.color}`} />
                {def.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Arcos Narrativos de Trilogía / Inicio Rápido */}
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Plantillas de Arco Narrativo en 1 Clic:
        </span>
        <div className="flex flex-wrap gap-2">
          {currentGenre === "adult" && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs gap-1.5 border-primary/40 hover:bg-primary/10"
                onClick={() => handleApplyFullArc("nsfw_heat", "Provocación y Éxtasis")}
              >
                <Flame className="h-3.5 w-3.5 text-primary" />
                Arco: Provocación, Cowgirl y Mating Press
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs gap-1.5 border-primary/40 hover:bg-primary/10"
                onClick={() => handleApplyFullArc("nsfw_wild", "Intensidad Salvaje")}
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Arco: Doggystyle, Piledriver y Acabada
              </Button>
            </>
          )}

          {currentGenre === "romance" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs gap-1.5 border-rose-500/40 hover:bg-rose-500/10"
              onClick={() => handleApplyFullArc("sfw_romance", "Romance Inevitable")}
            >
              <Heart className="h-3.5 w-3.5 text-rose-500" />
              Arco Romance: Tensión, Confesión y Beso
            </Button>
          )}

          {currentGenre === "horror" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs gap-1.5 border-purple-500/40 hover:bg-purple-500/10"
              onClick={() => handleApplyFullArc("sfw_horror", "Pesadilla en Sombras")}
            >
              <Ghost className="h-3.5 w-3.5 text-purple-400" />
              Arco Terror: Inquietud, Pasillo y Encuentro
            </Button>
          )}

          {currentGenre === "sports" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs gap-1.5 border-amber-500/40 hover:bg-amber-500/10"
              onClick={() => handleApplyFullArc("sfw_sports", "Camino a la Victoria")}
            >
              <Trophy className="h-3.5 w-3.5 text-amber-400" />
              Arco Deportivo: Foco, Arranque y Victoria
            </Button>
          )}

          {currentGenre === "action" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs gap-1.5 border-red-500/40 hover:bg-red-500/10"
              onClick={() => handleApplyFullArc("sfw_action", "Operación Extrema")}
            >
              <Crosshair className="h-3.5 w-3.5 text-red-500" />
              Arco Acción: Infiltración, Combate y Explosión
            </Button>
          )}
        </div>
      </div>

      {/* Grid de Presets Individuales */}
      <div className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Encuadres Cinemáticos y Poses ({presets.length}):
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
          {presets.map((preset) => {
            const isSelected = selectedPreset?.id === preset.id;
            return (
              <div
                key={preset.id}
                className={`rounded-lg border p-2.5 text-left transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/10 ring-1 ring-primary shadow-sm"
                    : "border-border/80 bg-background/50 hover:border-border hover:bg-muted/40"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedPreset(preset)}
                  className="w-full text-left"
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-base">{preset.icon}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                      {preset.badge}
                    </Badge>
                  </div>
                  <p className="text-xs font-semibold truncate leading-tight">{preset.title}</p>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{preset.camera}</p>
                </button>

                {/* Acciones directas para asignar a CUALQUIER capítulo dinámico */}
                {isSelected && (
                  <div className="mt-2.5 pt-2 border-t border-border/60 space-y-1.5 animate-in fade-in duration-200">
                    <p className="text-[10px] text-muted-foreground font-medium">Asignar toma a capítulo:</p>
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                      {Array.from({ length: totalChapters }, (_, idx) => {
                        const isDone =
                          appliedChapter?.chapter === idx && appliedChapter.presetId === preset.id;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleApplyToChapter(idx, preset);
                            }}
                            className={`py-1 px-2 rounded text-[10px] font-bold transition-all ${
                              isDone
                                ? "bg-emerald-600 text-white"
                                : "bg-primary text-primary-foreground hover:opacity-90"
                            }`}
                          >
                            {isDone ? <Check className="h-3 w-3 inline mr-0.5" /> : `Cap ${idx + 1}`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Detalle del Preset Seleccionado */}
      {selectedPreset && (
        <div className="rounded-lg border border-border/80 bg-background/80 p-3 text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <span>{selectedPreset.icon}</span> {selectedPreset.title} ({selectedPreset.camera})
            </span>
            <span className="text-[10px] text-muted-foreground">Prompt Cinemático Wan 2.1</span>
          </div>
          <p className="text-muted-foreground italic line-clamp-2">{selectedPreset.visualPrompt}</p>
          <p className="text-accent text-[11px] font-medium">
            Diálogo sugerido: <span className="text-foreground">"{selectedPreset.suggestedLine}"</span>
          </p>
        </div>
      )}
    </div>
  );
}
