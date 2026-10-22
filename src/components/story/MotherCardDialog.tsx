import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, Cpu, Sparkles, Check, RotateCcw } from "lucide-react";
import { getMotherCardConfig, saveMotherCardConfig, DEFAULT_MOTHER_CARD, type MotherCardConfig } from "@/lib/roleplayBase";
import { AVAILABLE_AI_MODELS, type MemoryTier } from "@/lib/storyAiSettings";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";

interface MotherCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MotherCardDialog({ open, onOpenChange }: MotherCardDialogProps) {
  const { language } = useLanguage();
  const isEs = language === "es";

  const [config, setConfig] = useState<MotherCardConfig>(() => getMotherCardConfig());

  useEffect(() => {
    if (open) {
      setConfig(getMotherCardConfig());
    }
  }, [open]);

  const handleSave = () => {
    saveMotherCardConfig(config);
    toast({
      title: isEs ? "Tarjeta Madre actualizada" : "Mother Card updated",
      description: isEs
        ? "Los cambios en el motor de roleplay base se han aplicado automáticamente a todas las tarjetas del sistema."
        : "Base roleplay engine changes have been automatically propagated to all cards across the system.",
    });
    onOpenChange(false);
  };

  const handleResetDefaults = () => {
    if (confirm(isEs ? "¿Restablecer la Tarjeta Madre a los valores maestros de fábrica?" : "Reset Mother Card to factory master defaults?")) {
      setConfig({ ...DEFAULT_MOTHER_CARD });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto bg-zinc-950 text-zinc-100 border-zinc-800 p-6">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                {isEs ? "Tarjeta Madre (Roleplay Base)" : "Mother Card (Roleplay Base)"}
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-mono">
                  v{config.version}
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-400">
                {isEs
                  ? "Configuración central del motor de roleplay. Cualquier cambio aquí se aplica instantáneamente a todas las tarjetas de historias, chats y tarjetas creadas por usuarios."
                  : "Central roleplay engine configuration. Any changes here propagate instantly to all story cards, chats, and user-created cards."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 my-3 text-sm">
          {/* AI Model selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-300 flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
              {isEs ? "Modelo de IA Predeterminado" : "Default AI Engine"}
            </Label>
            <Select
              value={config.aiSettings.modelId}
              onValueChange={(val) =>
                setConfig((prev) => ({
                  ...prev,
                  aiSettings: { ...prev.aiSettings, modelId: val },
                }))
              }
            >
              <SelectTrigger className="bg-zinc-900 border-zinc-800 text-zinc-100 h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                {AVAILABLE_AI_MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} ({m.badge})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Proportions: Dialogue vs Narrative */}
          <div className="grid grid-cols-2 gap-4 bg-zinc-900/60 border border-zinc-800/80 p-3.5 rounded-xl">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-zinc-300">
                {isEs ? "% Diálogo Hablado" : "% Spoken Dialogue"}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={50}
                  max={95}
                  value={Math.round(config.dialogueRatio * 100)}
                  onChange={(e) => {
                    const dial = Number(e.target.value) / 100;
                    setConfig((prev) => ({
                      ...prev,
                      dialogueRatio: dial,
                      narrationRatio: Math.max(0.05, 1 - dial),
                    }));
                  }}
                  className="bg-zinc-950 border-zinc-800 text-amber-400 font-bold"
                />
                <span className="text-xs text-zinc-400 font-bold">%</span>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-zinc-300">
                {isEs ? "% Relato en Asteriscos" : "% Asterisk Narration"}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  disabled
                  value={Math.round(config.narrationRatio * 100)}
                  className="bg-zinc-950/60 border-zinc-800 text-zinc-400 font-bold"
                />
                <span className="text-xs text-zinc-400 font-bold">%</span>
              </div>
            </div>
          </div>

          {/* Memory tier and target tokens */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-zinc-300">
                {isEs ? "Nivel de Memoria Base" : "Base Memory Tier"}
              </Label>
              <Select
                value={config.aiSettings.memoryTier}
                onValueChange={(val: MemoryTier) =>
                  setConfig((prev) => ({
                    ...prev,
                    aiSettings: { ...prev.aiSettings, memoryTier: val },
                  }))
                }
              >
                <SelectTrigger className="bg-zinc-900 border-zinc-800 text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                  <SelectItem value="2k">2K (Rápido)</SelectItem>
                  <SelectItem value="4k">4K (Equilibrado)</SelectItem>
                  <SelectItem value="16k">16K (Recomendado)</SelectItem>
                  <SelectItem value="32k">32K (Profundo)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-zinc-300">
                {isEs ? "Longitud de Tokens" : "Token Budget"}
              </Label>
              <Input
                type="number"
                min={150}
                max={700}
                value={config.targetTokens}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setConfig((prev) => ({
                    ...prev,
                    targetTokens: val,
                    aiSettings: { ...prev.aiSettings, messageLength: val },
                  }));
                }}
                className="bg-zinc-900 border-zinc-800 text-zinc-100"
              />
            </div>
          </div>

          {/* Master Directive */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
              <span>{isEs ? "Directiva de Roleplay Maestro (Reglas de Oro)" : "Master Roleplay Directive"}</span>
              <span className="text-[10px] text-zinc-500 font-normal">
                {isEs ? "Heredada por todas las tarjetas" : "Inherited by all cards"}
              </span>
            </Label>
            <Textarea
              rows={6}
              value={config.masterDirective}
              onChange={(e) => setConfig((prev) => ({ ...prev, masterDirective: e.target.value }))}
              placeholder={isEs ? "Instrucciones de comportamiento que aplican a todas las tarjetas..." : "Behavior instructions that apply to all cards..."}
              className="bg-zinc-900 border-zinc-800 text-xs text-zinc-200 font-mono resize-none leading-relaxed"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-zinc-800/80">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleResetDefaults}
            className="text-zinc-400 hover:text-zinc-200 gap-1.5 text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {isEs ? "Valores de Fábrica" : "Reset Defaults"}
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="border-zinc-800 text-zinc-300"
            >
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              className="bg-amber-500 hover:bg-amber-600 text-black font-bold gap-1.5"
            >
              <Check className="w-4 h-4" />
              {isEs ? "Aplicar a Todas las Tarjetas" : "Apply to All Cards"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
