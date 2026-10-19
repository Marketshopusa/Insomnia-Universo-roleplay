import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STUDIO_PRESETS, PRESET_ARCS, type StudioPreset } from "@/lib/studioPresets";
import { Sparkles, Clapperboard, Flame, Heart, Check } from "lucide-react";

interface StudioPresetDirectorProps {
  onApplyScene: (chapterIndex: number, visualPrompt: string, suggestedLine: string) => void;
  onApplyArc: (arcTitle: string, chapters: { visual: string; line: string }[]) => void;
  initialCategory?: "sfw" | "nsfw";
}

export function StudioPresetDirector({
  onApplyScene,
  onApplyArc,
  initialCategory = "nsfw",
}: StudioPresetDirectorProps) {
  const [category, setCategory] = useState<"sfw" | "nsfw">(initialCategory);
  const [selectedPreset, setSelectedPreset] = useState<StudioPreset | null>(null);
  const [appliedChapter, setAppliedChapter] = useState<{ chapter: number; presetId: string } | null>(null);

  const presets = STUDIO_PRESETS.filter((p) => p.category === category);

  const handleApplyToChapter = (chapterIndex: number, preset: StudioPreset) => {
    onApplyScene(chapterIndex, preset.visualPrompt, preset.suggestedLine);
    setAppliedChapter({ chapter: chapterIndex, presetId: preset.id });
    setTimeout(() => setAppliedChapter(null), 2500);
  };

  const handleApplyFullArc = (arcKey: keyof typeof PRESET_ARCS, arcName: string) => {
    const arc = PRESET_ARCS[arcKey];
    const fullChapters = arc.map((item) => {
      const preset = STUDIO_PRESETS.find((p) => p.id === item.presetId);
      return {
        visual: preset ? preset.visualPrompt : item.title,
        line: preset ? preset.suggestedLine : "",
      };
    });
    onApplyArc(arcName, fullChapters);
  };

  return (
    <div className="rounded-xl border border-border bg-card/60 backdrop-blur p-4 space-y-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clapperboard className="h-5 w-5 text-accent" />
          <h3 className="font-semibold text-base">Director de Escenas y Poses</h3>
          <Badge variant="outline" className="text-xs">
            Inspirado en Estudio Pro
          </Badge>
        </div>

        {/* Selector de Modo */}
        <div className="flex items-center bg-muted/60 p-1 rounded-lg border border-border text-xs">
          <button
            type="button"
            onClick={() => setCategory("nsfw")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
              category === "nsfw"
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Flame className="h-3.5 w-3.5" />
            Adultos / NSFW
          </button>
          <button
            type="button"
            onClick={() => setCategory("sfw")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
              category === "sfw"
                ? "bg-accent text-accent-foreground shadow"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Heart className="h-3.5 w-3.5" />
            Drama / SFW
          </button>
        </div>
      </div>

      {/* Arcos Narrativos de 3 Capítulos en un Clic */}
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Cargar Trilogía Completa en 1 Clic:
        </span>
        <div className="flex flex-wrap gap-2">
          {category === "nsfw" ? (
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
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs gap-1.5 border-accent/40 hover:bg-accent/10"
              onClick={() => handleApplyFullArc("sfw_romance", "Romance Inevitable")}
            >
              <Heart className="h-3.5 w-3.5 text-accent" />
              Arco Drama: Tensión, Confesión y Beso
            </Button>
          )}
        </div>
      </div>

      {/* Grid de Presets Individuales */}
      <div className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Poses y Tomas de Cámara:
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

                {/* Acciones directas para asignar a un capítulo */}
                {isSelected && (
                  <div className="mt-2.5 pt-2 border-t border-border/60 space-y-1.5 animate-in fade-in duration-200">
                    <p className="text-[10px] text-muted-foreground font-medium">Asignar escena a:</p>
                    <div className="flex gap-1">
                      {[0, 1, 2].map((idx) => {
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
                            className={`flex-1 py-1 px-1 rounded text-[10px] font-bold transition-all ${
                              isDone
                                ? "bg-emerald-600 text-white"
                                : "bg-primary text-primary-foreground hover:opacity-90"
                            }`}
                          >
                            {isDone ? <Check className="h-3 w-3 mx-auto" /> : `Cap ${idx + 1}`}
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
            <span className="text-[10px] text-muted-foreground">Prompt Cinemático</span>
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
