import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  type MemoryTier,
  type ModelTier,
  type StoryAiSettings,
  AVAILABLE_AI_MODELS,
  getStoryAiSettings,
  setStoryAiSettings,
} from "@/lib/storyAiSettings";
import { cn } from "@/lib/utils";
import { Sparkles, Brain, Sliders, Check, Crown, Key, Eye, EyeOff } from "lucide-react";

interface ChatAiSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storyId?: string | null;
  onSettingsSaved?: (settings: StoryAiSettings) => void;
}

export const ChatAiSettingsDialog = ({
  open,
  onOpenChange,
  storyId,
  onSettingsSaved,
}: ChatAiSettingsDialogProps) => {
  const [activeTab, setActiveTab] = useState<"memory" | "models" | "keys">("memory");
  const [memoryTier, setMemoryTier] = useState<MemoryTier>("16k");
  const [messageLength, setMessageLength] = useState<number>(350);
  const [modelTier, setModelTier] = useState<ModelTier>("free");
  const [modelId, setModelId] = useState<string>("insomnia-flash");
  const [customDirective, setCustomDirective] = useState<string>("");
  const [openRouterApiKey, setOpenRouterApiKey] = useState<string>("");
  const [nvidiaApiKey, setNvidiaApiKey] = useState<string>("");
  const [geminiApiKey, setGeminiApiKey] = useState<string>("");
  const [showKeys, setShowKeys] = useState(false);

  useEffect(() => {
    if (open) {
      const current = getStoryAiSettings(storyId);
      setMemoryTier(current.memoryTier);
      setMessageLength(current.messageLength);
      setModelTier(current.modelTier);
      setModelId(current.modelId);
      setCustomDirective(current.customDirective || "");
      setOpenRouterApiKey(current.openRouterApiKey || "");
      setNvidiaApiKey(current.nvidiaApiKey || "");
      setGeminiApiKey(current.geminiApiKey || "");
    }
  }, [open, storyId]);

  const handleSave = () => {
    const updated: StoryAiSettings = {
      memoryTier,
      messageLength,
      modelTier,
      modelId,
      customDirective,
      openRouterApiKey: openRouterApiKey.trim(),
      nvidiaApiKey: nvidiaApiKey.trim(),
      geminiApiKey: geminiApiKey.trim(),
    };
    setStoryAiSettings(storyId, updated);
    onSettingsSaved?.(updated);
    onOpenChange(false);
  };

  const modelsForSelectedTier = AVAILABLE_AI_MODELS.filter((m) => m.tier === modelTier);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col bg-[#121319] border-[#262837] text-white p-0 gap-0 overflow-hidden shadow-2xl rounded-2xl">
        <DialogHeader className="p-6 pb-3 border-b border-[#232535]">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <span>Configuración de IA, Memoria y Modelos</span>
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-neutral-400">
            Ajustes avanzados al estilo Momoo AI para personalizar la capacidad de memoria, longitud de respuesta, modelo neural y tus propias API Keys.
          </DialogDescription>

          {/* Navigation sub-tabs */}
          <div className="grid grid-cols-3 gap-2 mt-4 bg-[#1a1c27] p-1 rounded-xl border border-[#2b2d3e]">
            <button
              type="button"
              onClick={() => setActiveTab("memory")}
              className={cn(
                "py-2 px-2 text-xs sm:text-sm font-medium rounded-lg flex items-center justify-center gap-1.5 transition-all",
                activeTab === "memory"
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-indigo-950/50"
                  : "text-neutral-400 hover:text-white"
              )}
            >
              <Brain className="w-4 h-4" />
              <span>Memoria</span>
              <span className="hidden sm:inline-flex text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded-full font-bold items-center gap-0.5">
                <Crown className="w-2.5 h-2.5" /> PRO+
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("models")}
              className={cn(
                "py-2 px-2 text-xs sm:text-sm font-medium rounded-lg flex items-center justify-center gap-1.5 transition-all",
                activeTab === "models"
                  ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md shadow-purple-950/50"
                  : "text-neutral-400 hover:text-white"
              )}
            >
              <Sliders className="w-4 h-4" />
              <span>Modelos</span>
              <span className="hidden sm:inline-flex text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded-full font-bold items-center gap-0.5">
                <Crown className="w-2.5 h-2.5" /> PRO+
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("keys")}
              className={cn(
                "py-2 px-2 text-xs sm:text-sm font-medium rounded-lg flex items-center justify-center gap-1.5 transition-all",
                activeTab === "keys"
                  ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-teal-950/50"
                  : "text-neutral-400 hover:text-white"
              )}
            >
              <Key className="w-4 h-4" />
              <span>APIs Propias</span>
              {(openRouterApiKey || nvidiaApiKey) && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>
          </div>
        </DialogHeader>

        {/* Dialog Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === "memory" && (
            <div className="space-y-6">
              {/* Header section */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-semibold text-white">Memoria de chat</h3>
                  <span className="text-[10px] bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 shadow">
                    👑 PRO+
                  </span>
                </div>
                <p className="text-xs text-neutral-400">
                  Cuanto mayor sea la memoria, más conversaciones podrá recordar este personaje sin disociar ni perder el hilo de la historia.
                </p>
              </div>

              {/* 4 Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* 2K Free */}
                <button
                  type="button"
                  onClick={() => setMemoryTier("2k")}
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all relative overflow-hidden",
                    "bg-[#1b1e2a] hover:bg-[#222636]",
                    memoryTier === "2k"
                      ? "border-cyan-400 ring-2 ring-cyan-400/40 shadow-lg shadow-cyan-950/40"
                      : "border-[#2d3043]"
                  )}
                >
                  <span className="text-xl font-black text-white tracking-wide">2K</span>
                  <span className="mt-2 text-xs font-semibold px-3 py-1 rounded-full bg-neutral-700/60 text-neutral-300">
                    Free
                  </span>
                  <span className="mt-2 text-[10px] text-neutral-400">
                    ~2.048 tokens
                  </span>
                </button>

                {/* 4K Standard */}
                <button
                  type="button"
                  onClick={() => setMemoryTier("4k")}
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all relative overflow-hidden",
                    "bg-[#473473] hover:bg-[#523d85]",
                    memoryTier === "4k"
                      ? "border-purple-300 ring-2 ring-purple-400/60 shadow-lg shadow-purple-950/50"
                      : "border-[#5c4494]"
                  )}
                >
                  <span className="text-xl font-black text-white tracking-wide">4K</span>
                  <span className="mt-2 text-xs font-semibold px-3 py-1 rounded-full bg-[#7254b7] text-white">
                    Standard
                  </span>
                  <span className="mt-2 text-[10px] text-purple-200">
                    ~4.096 tokens
                  </span>
                </button>

                {/* 16K Premium */}
                <button
                  type="button"
                  onClick={() => setMemoryTier("16k")}
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all relative overflow-hidden",
                    "bg-[#805e26] hover:bg-[#966f2c]",
                    memoryTier === "16k"
                      ? "border-amber-300 ring-2 ring-amber-400/60 shadow-lg shadow-amber-950/50"
                      : "border-[#9b732f]"
                  )}
                >
                  <span className="text-xl font-black text-white tracking-wide">16K</span>
                  <span className="mt-2 text-xs font-semibold px-3 py-1 rounded-full bg-[#4e3612] text-amber-200">
                    Premium
                  </span>
                  <span className="mt-2 text-[10px] text-amber-100">
                    ~16.384 tokens
                  </span>
                </button>

                {/* 32K Deluxe */}
                <button
                  type="button"
                  onClick={() => setMemoryTier("32k")}
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all relative overflow-hidden",
                    "bg-gradient-to-b from-[#b3237e] to-[#7f1356] hover:from-[#c7298c] hover:to-[#8f1661]",
                    memoryTier === "32k"
                      ? "border-pink-300 ring-2 ring-pink-400/60 shadow-lg shadow-pink-950/50"
                      : "border-[#d13a98]"
                  )}
                >
                  <span className="text-xl font-black text-white tracking-wide">32K</span>
                  <span className="mt-2 text-xs font-semibold px-3 py-1 rounded-full bg-[#4d0933] text-pink-200">
                    Deluxe
                  </span>
                  <span className="mt-2 text-[10px] text-pink-100">
                    ~32.768 tokens
                  </span>
                </button>
              </div>

              {/* Memory explanation box */}
              <div className="bg-[#181a24] p-4 rounded-xl border border-[#2b2d3e] text-xs text-neutral-300 space-y-1.5">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Nivel activo: {memoryTier.toUpperCase()}</span>
                </div>
                <p className="text-neutral-400">
                  {memoryTier === "2k" && "Memoria compacta de 2K tokens: Mantiene el hilo de las últimas respuestas recientes (~24 turnos)."}
                  {memoryTier === "4k" && "Memoria estándar de 4K tokens: Mayor retención de diálogos y acciones de la escena actual (~48 turnos)."}
                  {memoryTier === "16k" && "Memoria profunda de 16K tokens: Recuerda secretos, confesiones previas y eventos desde el inicio de la historia (~120 turnos)."}
                  {memoryTier === "32k" && "Memoria masiva de 32K tokens: Memoria fotográfica continua. El personaje nunca olvida nada de lo sucedido a lo largo de todo el juego (~260 turnos y 15.000 caracteres de crónica permanente)."}
                </p>
              </div>

              {/* Custom directives */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-white">Personalizado</h4>
                  <span className="text-[10px] bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 shadow">
                    👑 PRO+
                  </span>
                </div>
                <p className="text-xs text-neutral-400">
                  Instrucciones o recuerdos especiales que el personaje debe tener presentes en todo momento (por ejemplo: &quot;Recuerda que somos hermanos y tenemos un secreto en la camioneta&quot;).
                </p>
                <Textarea
                  value={customDirective}
                  onChange={(e) => setCustomDirective(e.target.value)}
                  placeholder="Escribe recuerdos fijos, detalles íntimos o reglas para este personaje..."
                  className="bg-[#181a24] border-[#2b2d3e] text-white placeholder:text-neutral-500 focus:border-indigo-500 min-h-[90px] rounded-xl text-sm"
                />
              </div>
            </div>
          )}

          {activeTab === "models" && (
            <div className="space-y-6">
              {/* Message length slider */}
              <div className="bg-[#181a24] p-4 rounded-xl border border-[#2b2d3e] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">Longitud del mensaje</span>
                    <span className="text-[10px] bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 shadow">
                      👑 PRO+
                    </span>
                  </div>
                  <div className="text-sm font-bold text-amber-400 flex items-center gap-1">
                    <span className="text-xs text-neutral-400 font-normal">Valor actual:</span>
                    <span>{messageLength}</span>
                  </div>
                </div>

                <div className="pt-2 pb-1">
                  <Slider
                    value={[messageLength]}
                    onValueChange={([val]) => setMessageLength(val)}
                    min={100}
                    max={600}
                    step={25}
                    className="cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-neutral-500 mt-2 px-1">
                    <span>100 (Breve)</span>
                    <span>250</span>
                    <span>350 (Equilibrado)</span>
                    <span>500</span>
                    <span>600 (Detallado)</span>
                  </div>
                </div>
              </div>

              {/* Model Tier Selector Tabs */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">Modelo de IA</span>
                  <span className="text-[10px] bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 shadow">
                    👑 PRO+
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2 bg-[#181a24] p-1.5 rounded-xl border border-[#2b2d3e]">
                  {(["free", "standard", "premium", "deluxe"] as ModelTier[]).map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => {
                        setModelTier(tier);
                        const firstInTier = AVAILABLE_AI_MODELS.find((m) => m.tier === tier);
                        if (firstInTier) setModelId(firstInTier.id);
                      }}
                      className={cn(
                        "py-1.5 px-2 text-xs font-semibold rounded-lg capitalize transition-all",
                        modelTier === tier
                          ? tier === "free"
                            ? "bg-neutral-700 text-white shadow"
                            : tier === "standard"
                            ? "bg-purple-600 text-white shadow"
                            : tier === "premium"
                            ? "bg-amber-600 text-white shadow"
                            : "bg-pink-600 text-white shadow"
                          : "text-neutral-400 hover:text-white"
                      )}
                    >
                      {tier === "free" ? "Gratis" : tier}
                    </button>
                  ))}
                </div>
              </div>

              {/* Models List for the selected tier */}
              <div className="space-y-3">
                {modelsForSelectedTier.map((model) => {
                  const isSelected = modelId === model.id;
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => setModelId(model.id)}
                      className={cn(
                        "w-full text-left p-4 rounded-xl border transition-all relative block",
                        isSelected
                          ? model.tier === "deluxe"
                            ? "bg-gradient-to-r from-[#7a1856] to-[#450d30] border-pink-400 ring-2 ring-pink-400/40"
                            : model.tier === "premium"
                            ? "bg-[#6b4e1f] border-amber-400 ring-2 ring-amber-400/40"
                            : model.tier === "standard"
                            ? "bg-[#43306d] border-purple-400 ring-2 ring-purple-400/40"
                            : "bg-[#1f2233] border-cyan-400 ring-2 ring-cyan-400/40"
                          : "bg-[#181a24] border-[#2b2d3e] hover:border-[#3d4057]"
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm text-white flex items-center gap-2">
                          {model.name}
                        </span>
                        <span
                          className={cn(
                            "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase",
                            model.tier === "deluxe"
                              ? "bg-pink-900/80 text-pink-200"
                              : model.tier === "premium"
                              ? "bg-amber-900/80 text-amber-200"
                              : model.tier === "standard"
                              ? "bg-purple-900/80 text-purple-200"
                              : "bg-neutral-800 text-neutral-300"
                          )}
                        >
                          {model.badge}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-300 mb-2 leading-relaxed">
                        {model.description}
                      </p>
                      <ul className="text-[11px] text-neutral-400 space-y-1 list-disc list-inside">
                        <li>{model.bullet1}</li>
                        <li>{model.bullet2}</li>
                      </ul>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "keys" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Key className="w-4 h-4 text-emerald-400" />
                  <span>Tus Claves de API Personales (Opcional)</span>
                </h3>
                <p className="text-xs text-neutral-400 mt-1">
                  Si deseas usar modelos Deluxe o Premium (como Euryale 70B, DeepSeek V4 o WizardLM 8x22B) sin límites de saldo compartido del servidor, puedes colocar aquí tu propia clave de API.
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowKeys((v) => !v)}
                  className="text-xs text-neutral-400 hover:text-white flex items-center gap-1.5"
                >
                  {showKeys ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showKeys ? "Ocultar claves" : "Mostrar claves"}</span>
                </button>
              </div>

              {/* Google Gemini Key */}
              <div className="bg-[#181a24] p-4 rounded-xl border border-[#2b2d3e] space-y-2">
                <label className="text-xs font-semibold text-neutral-200 flex items-center justify-between">
                  <span>Clave API de Google Gemini (Para Insomnia Flash ultra rápido ~1.0s)</span>
                  <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                    100% GRATIS
                  </span>
                </label>
                <Input
                  type={showKeys ? "text" : "password"}
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="bg-[#121319] border-[#2b2d3e] text-white text-xs font-mono"
                />
                <p className="text-[11px] text-neutral-500">
                  Obtén tu clave gratuita en <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline font-semibold">aistudio.google.com/app/apikey</a> (Google AI Studio). Cero tarjeta de crédito, ilimitado para chats.
                </p>
              </div>

              {/* OpenRouter Key */}
              <div className="bg-[#181a24] p-4 rounded-xl border border-[#2b2d3e] space-y-2">
                <label className="text-xs font-semibold text-neutral-200 block">
                  Clave API de OpenRouter (para Euryale 70B, DeepSeek, Mistral, etc.)
                </label>
                <Input
                  type={showKeys ? "text" : "password"}
                  value={openRouterApiKey}
                  onChange={(e) => setOpenRouterApiKey(e.target.value)}
                  placeholder="sk-or-v1-..."
                  className="bg-[#121319] border-[#2b2d3e] text-white text-xs font-mono"
                />
                <p className="text-[11px] text-neutral-500">
                  Obtén tu clave en <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">openrouter.ai/settings/keys</a>. Si la dejas vacía, se usará la cuenta del servidor.
                </p>
              </div>

              {/* Nvidia NIM Key */}
              <div className="bg-[#181a24] p-4 rounded-xl border border-[#2b2d3e] space-y-2">
                <label className="text-xs font-semibold text-neutral-200 block">
                  Clave API de Nvidia NIM (Opcional / nvapi-...)
                </label>
                <Input
                  type={showKeys ? "text" : "password"}
                  value={nvidiaApiKey}
                  onChange={(e) => setNvidiaApiKey(e.target.value)}
                  placeholder="nvapi-..."
                  className="bg-[#121319] border-[#2b2d3e] text-white text-xs font-mono"
                />
                <p className="text-[11px] text-neutral-500">
                  Nvidia NIM es gratuito con 1000 créditos al registrarte en <a href="https://build.nvidia.com" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">build.nvidia.com</a>.
                </p>
              </div>

              <div className="bg-[#15231c] border border-emerald-900/40 p-3 rounded-xl text-xs text-emerald-300">
                <p className="font-semibold mb-0.5">💡 ¿Cómo funciona?</p>
                <p className="text-[11px] text-emerald-200/80">
                  Tus claves se guardan de forma segura en tu navegador local (`localStorage`) y se envían de forma cifrada únicamente para procesar las respuestas de este chat. Nunca se comparten con otros usuarios.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Dialog Footer */}
        <div className="p-4 px-6 border-t border-[#232535] bg-[#121319] flex justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-neutral-400 hover:text-white"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 hover:from-pink-600 hover:via-purple-600 hover:to-indigo-600 text-white font-bold px-6 rounded-xl shadow-lg shadow-purple-950/50"
          >
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
