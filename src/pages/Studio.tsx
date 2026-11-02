import React, { useState, useEffect, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import {
  Clapperboard,
  Sparkles,
  Play,
  RotateCcw,
  CheckCircle2,
  Film,
  Users,
  Video,
  Download,
  Volume2,
  Loader2,
  MapPin,
  Flame,
  Skull,
  Heart,
  Zap,
  Smile,
  ShieldCheck,
  Eye,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { CharacterModal } from "@/components/studio/CharacterModal";
import { StudioProduction, type ProductionSeries } from "@/components/studio/StudioProduction";
import { invokeFunctionWithRetry } from "@/lib/invokeFunction";
import {
  probeLocalKineva,
  createLocalJob,
  encodeLocalImage,
  fetchLocalJob,
  localVideoSrc,
  type LocalProbe,
  type LocalJob,
} from "@/lib/kinevaLocal";
import { streamSpeech } from "@/lib/ttsStream";
import { STORY_VOICES } from "@/lib/voices";

export type StudioGenre = "terror" | "adult" | "romance" | "action" | "comedy";

interface ChapterDraft {
  chapter_number: number;
  visual: string;
  dialogue: string;
  speaker: string;
  sfx: string;
}

const GENRE_CONFIG: Record<
  StudioGenre,
  {
    name: string;
    icon: React.ElementType;
    badge: string;
    color: string;
    placeholder: string;
    isAdult: boolean;
  }
> = {
  terror: {
    name: "Terror / Suspenso",
    icon: Skull,
    badge: "ReelShort / James Wan",
    color: "from-red-950/60 to-neutral-900 border-red-500/40 text-red-400",
    placeholder:
      "Ejemplo: Dos personas acampando en un bosque denso escuchan ramas quebrándose. Una figura macabra las persigue en la oscuridad. Huyen desesperadas hasta llegar a la carretera asfaltada donde la criatura no puede cruzar...",
    isAdult: false,
  },
  adult: {
    name: "Adulto / NSFW",
    icon: Flame,
    badge: "Candy Shorts / Erotic Thriller",
    color: "from-purple-950/60 to-neutral-900 border-purple-500/40 text-purple-400",
    placeholder:
      "Ejemplo: Dos inquilinos que no se soportan quedan atrapados en un ático durante una tormenta eléctrica torrencial. Entre copas de vino y la luz tenue de los relámpagos, la tensión y la cercanía física se vuelven irresistibles...",
    isAdult: true,
  },
  romance: {
    name: "Romance / Drama",
    icon: Heart,
    badge: "DramaBox Melodrama",
    color: "from-pink-950/60 to-neutral-900 border-pink-500/40 text-pink-400",
    placeholder:
      "Ejemplo: En la fiesta de compromiso de la alta sociedad, la verdadera heredera aparece desenmascarando a su prometido infiel frente a toda la prensa...",
    isAdult: false,
  },
  action: {
    name: "Acción / Venganza",
    icon: Zap,
    badge: "ShortMax / John Wick",
    color: "from-amber-950/60 to-neutral-900 border-amber-500/40 text-amber-400",
    placeholder:
      "Ejemplo: Un exagente emboscado en un callejón nocturno protege a una testigo clave mientras escapan saltando por azoteas bajo fuego enemigo...",
    isAdult: false,
  },
  comedy: {
    name: "Comedia / Sitcom",
    icon: Smile,
    badge: "Micro-Sitcom Vertical",
    color: "from-emerald-950/60 to-neutral-900 border-emerald-500/40 text-emerald-400",
    placeholder:
      "Ejemplo: Un novio finge ser millonario para impresionar a los suegros, pero contrató por error a dos actores de teatro callejero para hacerse pasar por sus padres...",
    isAdult: false,
  },
};

export default function Studio() {
  const { user, isAdmin } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();

  // Mode View: Director Studio vs. Screening Room
  const [activeTab, setActiveTab] = useState<"director" | "screening">("director");

  // Step 1: Configuration
  const [seriesTitle, setSeriesTitle] = useState("Sin Título - Miniserie");
  const [selectedGenre, setSelectedGenre] = useState<StudioGenre>("terror");
  const [chapterCount, setChapterCount] = useState<number>(3);
  const [premise, setPremise] = useState("");

  // Step 2: Casting & Set
  const [primaryName, setPrimaryName] = useState("Diego");
  const [primaryVoice, setPrimaryVoice] = useState("Fenrir");
  const [primaryImageFile, setPrimaryImageFile] = useState<File | null>(null);
  const [primaryPreviewUrl, setPrimaryPreviewUrl] = useState<string | null>(null);

  const [secondaryName, setSecondaryName] = useState("Elena");
  const [secondaryVoice, setSecondaryVoice] = useState("Aoede");
  const [secondaryImageFile, setSecondaryImageFile] = useState<File | null>(null);
  const [secondaryPreviewUrl, setSecondaryPreviewUrl] = useState<string | null>(null);

  const [locationName, setLocationName] = useState("Bosque nocturno con niebla");

  // Casting Modals
  const [modalRole, setModalRole] = useState<"primary" | "secondary" | null>(null);

  // Step 3: Script & Episodes
  const [generatingScript, setGeneratingScript] = useState(false);
  const [chapters, setChapters] = useState<ChapterDraft[]>([]);
  const [playingChapterIndex, setPlayingChapterIndex] = useState<number | null>(null);
  const [regeneratingChapterIndex, setRegeneratingChapterIndex] = useState<number | null>(null);

  // Step 4: Video Filming & Engine
  const [localProbe, setLocalProbe] = useState<LocalProbe | null>(null);
  const [isFilming, setIsFilming] = useState(false);
  const [currentJob, setCurrentJob] = useState<LocalJob | null>(null);
  const [filmingProgress, setFilmingProgress] = useState(0);
  const [renderedVideos, setRenderedVideos] = useState<Record<number, string>>({});
  const [activeVideoChapter, setActiveVideoChapter] = useState<number>(1);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Audio stream playback
  const audioContextRef = useRef<AudioContext | null>(null);

  // Refresh local Kineva ComfyUI worker status
  const refreshEngineProbe = async () => {
    try {
      const probe = await probeLocalKineva();
      setLocalProbe(probe);
      return probe;
    } catch {
      setLocalProbe(null);
      return null;
    }
  };

  useEffect(() => {
    void refreshEngineProbe();
    const interval = setInterval(() => {
      void refreshEngineProbe();
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // Cleanup polling timer
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // Set default premise placeholder when genre changes if empty
  const handleSelectGenre = (genre: StudioGenre) => {
    setSelectedGenre(genre);
    if (!premise.trim()) {
      setPremise(GENRE_CONFIG[genre].placeholder.replace(/^Ejemplo:\s*/i, ""));
    }
  };

  // 1. Generate Complete Script Draft with AI Showrunner
  const handleGenerateScript = async () => {
    if (!premise.trim() || premise.trim().length < 10) {
      toast({
        title: "Escribe una idea",
        description: "Por favor describe brevemente qué ocurre en tu miniserie.",
        variant: "destructive",
      });
      return;
    }

    setGeneratingScript(true);
    setChapters([]);
    try {
      const res = await invokeFunctionWithRetry<{ draft: { title: string; chapters: ChapterDraft[] } }>(
        "generate-studio-draft",
        {
          description: premise.trim(),
          genre: selectedGenre,
          isAdult: GENRE_CONFIG[selectedGenre].isAdult,
          chapters: chapterCount,
          cast_names: [primaryName.trim() || "Protagonista", secondaryName.trim() || "Acompañante"],
          location_name: locationName.trim(),
        }
      );

      if (res.error) {
        throw new Error(res.error.message || "No se pudo generar el guion.");
      }

      const draft = res.data?.draft;
      if (!draft || !Array.isArray(draft.chapters) || draft.chapters.length === 0) {
        throw new Error("El guion generado no devolvió capítulos completos.");
      }

      if (draft.title) setSeriesTitle(draft.title);
      setChapters(draft.chapters);
      toast({
        title: `✓ Guion de ${draft.chapters.length} capítulos listo`,
        description: `Estructurado con la fórmula de ${GENRE_CONFIG[selectedGenre].name}.`,
      });
    } catch (err: any) {
      toast({
        title: "Error al generar guion",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setGeneratingScript(false);
    }
  };

  // 2. Regenerate a Single Chapter without altering the others
  const handleRegenerateSingleChapter = async (index: number) => {
    setRegeneratingChapterIndex(index);
    try {
      const res = await invokeFunctionWithRetry<{ draft: { chapters: ChapterDraft[] } }>(
        "generate-studio-draft",
        {
          description: `Regenera únicamente el Capítulo ${index + 1} de la siguiente miniserie: "${premise}".
Contexto de los otros capítulos: ${JSON.stringify(chapters.map((c) => c.visual))}
Mantén estricta coherencia y ritmo para el género ${selectedGenre}.`,
          genre: selectedGenre,
          isAdult: GENRE_CONFIG[selectedGenre].isAdult,
          chapters: 1,
          cast_names: [primaryName, secondaryName],
          location_name: locationName,
        }
      );

      const newChapter = res.data?.draft?.chapters?.[0];
      if (newChapter) {
        setChapters((prev) => {
          const updated = [...prev];
          updated[index] = { ...newChapter, chapter_number: index + 1 };
          return updated;
        });
        toast({ title: `✓ Capítulo ${index + 1} regenerado exitosamente` });
      }
    } catch (err: any) {
      toast({ title: "No se pudo regenerar el capítulo", description: err.message, variant: "destructive" });
    } finally {
      setRegeneratingChapterIndex(null);
    }
  };

  // 3. Play Neural Voice Preview for Chapter Dialogue
  const handlePlayChapterAudio = async (index: number, dialogue: string, speakerName: string) => {
    if (playingChapterIndex === index) {
      setPlayingChapterIndex(null);
      return;
    }

    setPlayingChapterIndex(index);
    try {
      // Pick voice matching speaker
      const voiceId =
        speakerName.toLowerCase() === secondaryName.toLowerCase() ? secondaryVoice : primaryVoice;

      await streamSpeech(dialogue, {
        voice: voiceId,
        adultMode: GENRE_CONFIG[selectedGenre].isAdult,
        signal: AbortSignal.timeout(15000),
      });
    } catch (err: any) {
      toast({ title: "Error al reproducir audio", description: err.message, variant: "destructive" });
    } finally {
      setPlayingChapterIndex(null);
    }
  };

  // 4. Start Full Filming / Render Pipeline (Wan2.1 + LipSync)
  const handleStartFilming = async () => {
    if (!chapters.length) {
      toast({ title: "Genera el guion primero", variant: "destructive" });
      return;
    }

    const probe = await refreshEngineProbe();
    if (!probe || !probe.ready) {
      if (probe?.status === "missing-comfy" || !probe?.comfy) {
        toast({
          title: "ComfyUI está apagado",
          description: "Abre Comfy Desktop en tu computadora para que la tarjeta gráfica (GPU) pueda renderizar el video.",
          variant: "destructive",
        });
        return;
      }
      if (probe?.status === "missing-worker") {
        toast({
          title: "Worker local Kineva apagado",
          description: "Inicia el servicio Kineva en el puerto 8787 para procesar los videos.",
          variant: "destructive",
        });
        return;
      }
    }

    setIsFilming(true);
    setFilmingProgress(5);
    setRenderedVideos({});

    try {
      let primaryEncoded: string | null = null;
      if (primaryImageFile) {
        try {
          primaryEncoded = await encodeLocalImage(primaryImageFile);
        } catch { /* ignore */ }
      }

      let secondaryEncoded: string | null = null;
      if (secondaryImageFile) {
        try {
          secondaryEncoded = await encodeLocalImage(secondaryImageFile);
        } catch { /* ignore */ }
      }

      const job = await createLocalJob({
        image: primaryEncoded,
        cast: {
          primary_name: primaryName,
          secondary_name: secondaryName,
          secondary_image: secondaryEncoded,
          location_name: locationName,
        },
        idea: (premise.trim() || chapters[0]?.visual || seriesTitle || "Miniserie").slice(0, 1500),
        chapters: chapters.map((c) => c.visual.trim()),
        dialogues: chapters.map((c) => c.dialogue.trim()),
        shot_plans: chapters.map((c) => [{ visual: c.visual.trim(), dialogue: c.dialogue.trim(), speaker: c.speaker || primaryName }]),
        title: seriesTitle,
        description: premise,
        referenceImage: primaryImageFile,
        chapterCount: chapters.length,
        category: selectedGenre,
        isAdult: GENRE_CONFIG[selectedGenre].isAdult,
        bible: {
          chapters: chapters.map((c) => ({
            visual: c.visual,
            dialogue: c.dialogue,
            speaker: c.speaker,
          })),
          cast_names: [primaryName, secondaryName],
          location_name: locationName,
        },
      });

      setCurrentJob(job);
      toast({ title: "🎥 Rodaje cinematográfico iniciado en GPU" });

      // Start Polling Job Progress
      pollTimerRef.current = setInterval(async () => {
        try {
          const updated = await fetchLocalJob(job.id);
          setCurrentJob(updated);

          if (updated.state === "completed" || updated.state === "done") {
            clearInterval(pollTimerRef.current!);
            setIsFilming(false);
            setFilmingProgress(100);

            // Collect video URLs
            const vids: Record<number, string> = {};
            (updated.videos || []).forEach((v, idx) => {
              vids[idx + 1] = localVideoSrc(v.url);
            });
            setRenderedVideos(vids);
            toast({ title: "✨ ¡Miniserie filmada y renderizada con éxito!" });
          } else if (updated.state === "failed") {
            clearInterval(pollTimerRef.current!);
            setIsFilming(false);
            toast({
              title: "Error en el render",
              description: updated.error || "Ocurrió un error en el worker de GPU.",
              variant: "destructive",
            });
          } else {
            // Update estimated progress
            setFilmingProgress((prev) => Math.min(95, prev + 8));
          }
        } catch (pollErr) {
          console.warn("Poll job error:", pollErr);
        }
      }, 4000);
    } catch (err: any) {
      setIsFilming(false);
      toast({ title: "Error al iniciar el rodaje", description: err.message, variant: "destructive" });
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-black text-white pb-24">
        {/* TOP HEADER */}
        <div className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur sticky top-0 z-30 px-6 py-4">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center text-black shadow-lg shadow-amber-500/20">
                <Clapperboard className="w-5 h-5 fill-black" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-black tracking-tight text-white">
                    Estudio Cinematográfico de Miniseries
                  </h1>
                  <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400 font-bold">
                    9:16 Vertical
                  </Badge>
                  <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-400 font-bold">
                    Lip-Sync Wan2.1
                  </Badge>
                </div>
                <p className="text-xs text-neutral-400">
                  Crea series cinematográficas de terror, drama, acción y adultos estilo Candy Shorts & ReelShort.
                </p>
              </div>
            </div>

            {/* View Switcher */}
            <div className="flex items-center bg-neutral-900 border border-neutral-800 p-1 rounded-xl">
              <Button
                type="button"
                variant={activeTab === "director" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("director")}
                className={`text-xs font-bold gap-2 ${
                  activeTab === "director" ? "bg-amber-500 text-black hover:bg-amber-400" : "text-neutral-400"
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>Nuevo Rodaje</span>
              </Button>
              <Button
                type="button"
                variant={activeTab === "screening" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("screening")}
                className={`text-xs font-bold gap-2 ${
                  activeTab === "screening" ? "bg-amber-500 text-black hover:bg-amber-400" : "text-neutral-400"
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                <span>Sala de Proyección</span>
              </Button>
            </div>
          </div>
        </div>

        {/* SCREENING ROOM TAB */}
        {activeTab === "screening" ? (
          <div className="max-w-7xl mx-auto px-6 py-8">
            <StudioProduction
              userId={user?.id || ""}
              onEdit={() => setActiveTab("director")}
              onFilm={() => setActiveTab("director")}
            />
          </div>
        ) : (
          /* DIRECTOR STUDIO TWO-PANE LAYOUT */
          <div className="max-w-7xl mx-auto px-6 py-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* ========================================================= */}
              {/* LEFT COLUMN (4 COLS): CASTING & LOCACIÓN (HUB)           */}
              {/* ========================================================= */}
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-5 shadow-xl space-y-5">
                  <div className="flex items-center justify-between border-b border-neutral-850 pb-3">
                    <span className="text-xs font-black uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-amber-400" />
                      1. Casting de Actores
                    </span>
                    <span className="text-[10px] text-neutral-500">1 Clic para asignar</span>
                  </div>

                  {/* PROTAGONISTA CARD */}
                  <div
                    onClick={() => setModalRole("primary")}
                    className="group relative rounded-xl border-2 border-neutral-800 hover:border-amber-500/70 bg-neutral-900/60 p-3.5 cursor-pointer transition-all duration-200 flex items-center gap-4 hover:shadow-lg hover:shadow-amber-500/10"
                  >
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-black/60 border border-neutral-700 flex-shrink-0">
                      {primaryPreviewUrl ? (
                        <img src={primaryPreviewUrl} alt={primaryName} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-neutral-500">
                          <Users className="w-6 h-6" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Eye className="w-5 h-5 text-white" />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Badge className="bg-amber-500 text-black text-[9px] font-black px-1.5 py-0">
                          PROTAGONISTA
                        </Badge>
                        {primaryPreviewUrl && (
                          <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-0.5">
                            <CheckCircle2 className="w-3 h-3" /> Asignado
                          </span>
                        )}
                      </div>
                      <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={primaryName}
                          onChange={(e) => setPrimaryName(e.target.value)}
                          placeholder="Nombre del Protagonista"
                          className="w-full bg-black/50 border border-neutral-700/80 focus:border-amber-500 rounded px-2 py-0.5 text-xs font-bold text-white outline-none"
                          maxLength={30}
                        />
                      </div>
                      <p className="text-[11px] text-neutral-400 flex items-center gap-1 mt-0.5">
                        <Volume2 className="w-3 h-3 text-amber-400" /> Voz: {primaryVoice}
                      </p>
                    </div>
                  </div>

                  {/* CO-PROTAGONISTA / ANTAGONISTA CARD */}
                  <div
                    onClick={() => setModalRole("secondary")}
                    className="group relative rounded-xl border-2 border-neutral-800 hover:border-amber-500/70 bg-neutral-900/60 p-3.5 cursor-pointer transition-all duration-200 flex items-center gap-4 hover:shadow-lg hover:shadow-amber-500/10"
                  >
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-black/60 border border-neutral-700 flex-shrink-0">
                      {secondaryPreviewUrl ? (
                        <img src={secondaryPreviewUrl} alt={secondaryName} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-neutral-500">
                          <Users className="w-6 h-6" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Eye className="w-5 h-5 text-white" />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="border-neutral-700 text-neutral-300 text-[9px] font-black px-1.5 py-0">
                          CO-ESTRELLA
                        </Badge>
                        {secondaryPreviewUrl && (
                          <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-0.5">
                            <CheckCircle2 className="w-3 h-3" /> Asignado
                          </span>
                        )}
                      </div>
                      <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={secondaryName}
                          onChange={(e) => setSecondaryName(e.target.value)}
                          placeholder="Nombre de la Co-Estrella"
                          className="w-full bg-black/50 border border-neutral-700/80 focus:border-amber-500 rounded px-2 py-0.5 text-xs font-bold text-white outline-none"
                          maxLength={30}
                        />
                      </div>
                      <p className="text-[11px] text-neutral-400 flex items-center gap-1 mt-0.5">
                        <Volume2 className="w-3 h-3 text-amber-400" /> Voz: {secondaryVoice}
                      </p>
                    </div>
                  </div>

                  {/* LOCACIÓN Y SET */}
                  <div className="pt-2 border-t border-neutral-850 space-y-2">
                    <Label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-amber-400" /> Locación / Set Principal:
                    </Label>
                    <Input
                      value={locationName}
                      onChange={(e) => setLocationName(e.target.value)}
                      placeholder="Ejemplo: Bosque denso de noche con niebla"
                      className="bg-neutral-900 border-neutral-700 text-xs text-white"
                      maxLength={80}
                    />
                  </div>

                  {/* VOCAL PROFILE TUNER */}
                  <div className="pt-2 border-t border-neutral-850 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-neutral-400 block mb-1">Voz {primaryName}:</span>
                      <select
                        value={primaryVoice}
                        onChange={(e) => setPrimaryVoice(e.target.value)}
                        className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-white"
                      >
                        {STORY_VOICES.filter((v) => v.gender === "male").map((v) => (
                          <option key={v.value} value={v.value}>
                            {v.label} ({v.descriptionEs})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-400 block mb-1">Voz {secondaryName}:</span>
                      <select
                        value={secondaryVoice}
                        onChange={(e) => setSecondaryVoice(e.target.value)}
                        className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-white"
                      >
                        {STORY_VOICES.filter((v) => v.gender === "female").map((v) => (
                          <option key={v.value} value={v.value}>
                            {v.label} ({v.descriptionEs})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* GPU ENGINE STATUS BADGE */}
                <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950/60 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${
                        localProbe?.status === "ready" ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                      }`}
                    />
                    <span className="text-neutral-300 font-medium">
                      Motor Kineva GPU: {localProbe?.status === "ready" ? "Activo (Wan2.1)" : "Modo Cloud"}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-neutral-700 text-neutral-400">
                    Lip-Sync ON
                  </Badge>
                </div>
              </div>

              {/* ========================================================= */}
              {/* RIGHT COLUMN (8 COLS): GUION & TIMELINE DE RODAJES       */}
              {/* ========================================================= */}
              <div className="lg:col-span-8 space-y-6">
                {/* PREMISE & GENRE SELECTOR */}
                <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-850 pb-3">
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-wider text-neutral-200">
                        2. Género y Premisa de la Miniserie
                      </h3>
                      <p className="text-xs text-neutral-400">
                        Elige la atmósfera y escribe la historia que la IA estructurará.
                      </p>
                    </div>

                    {/* Chapter count selector */}
                    <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 p-1 rounded-xl">
                      {[3, 5, 8].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setChapterCount(num)}
                          className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-colors ${
                            chapterCount === num ? "bg-amber-500 text-black" : "text-neutral-400 hover:text-white"
                          }`}
                        >
                          {num} Caps
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 5 QUICK GENRE BUTTONS */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {(Object.keys(GENRE_CONFIG) as StudioGenre[]).map((genreKey) => {
                      const cfg = GENRE_CONFIG[genreKey];
                      const Icon = cfg.icon;
                      const isSelected = selectedGenre === genreKey;
                      return (
                        <button
                          key={genreKey}
                          type="button"
                          onClick={() => handleSelectGenre(genreKey)}
                          className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 ${
                            isSelected
                              ? `bg-gradient-to-b ${cfg.color} ring-2 ring-primary shadow-lg`
                              : "border-neutral-800 bg-neutral-900/60 hover:bg-neutral-800 text-neutral-300"
                          }`}
                        >
                          <Icon className={`w-5 h-5 ${isSelected ? "scale-110" : ""}`} />
                          <span className="text-xs font-bold leading-tight">{cfg.name}</span>
                          <span className="text-[9px] text-neutral-400 truncate max-w-full">{cfg.badge}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* PREMISE TEXTAREA */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-neutral-300">
                      Idea Central / Trama de la Miniserie:
                    </Label>
                    <Textarea
                      value={premise}
                      onChange={(e) => setPremise(e.target.value)}
                      placeholder={GENRE_CONFIG[selectedGenre].placeholder}
                      rows={3}
                      className="bg-neutral-900 border-neutral-700 text-sm text-white resize-none leading-relaxed"
                    />
                  </div>

                  {/* GENERATE SCRIPT CTA BUTTON */}
                  <Button
                    type="button"
                    onClick={() => void handleGenerateScript()}
                    disabled={generatingScript || !premise.trim()}
                    className="w-full py-6 text-sm font-black bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-black hover:opacity-90 shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2"
                  >
                    {generatingScript ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Showrunner IA desglosando tomas cinematográficas y diálogos...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5 fill-black" />
                        <span>Generar Guion de {chapterCount} Capítulos con IA</span>
                      </>
                    )}
                  </Button>
                </div>

                {/* ========================================================= */}
                {/* EPISODE TIMELINE & PRODUCTION CARDS                      */}
                {/* ========================================================= */}
                {chapters.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                      <div className="flex items-center gap-2">
                        <Clapperboard className="w-4 h-4 text-amber-400" />
                        <h3 className="text-sm font-black uppercase tracking-wider text-white">
                          Guion Técnico de Rodaje ({chapters.length} Capítulos)
                        </h3>
                      </div>
                      <span className="text-xs text-neutral-400">
                        Cada capítulo está listo para filmarse con Lip-Sync
                      </span>
                    </div>

                    <div className="space-y-4">
                      {chapters.map((chap, idx) => {
                        const isAudioPlaying = playingChapterIndex === idx;
                        const isRegenerating = regeneratingChapterIndex === idx;
                        const hasVideo = Boolean(renderedVideos[idx + 1]);

                        return (
                          <div
                            key={chap.chapter_number || idx}
                            className="bg-neutral-950 border border-neutral-800 rounded-2xl p-5 shadow-xl space-y-4 hover:border-neutral-700 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge className="bg-amber-500 text-black font-black text-xs">
                                  Capítulo {idx + 1}
                                </Badge>
                                <span className="text-xs text-neutral-400 font-medium">
                                  Voz principal: {chap.speaker || primaryName}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handlePlayChapterAudio(idx, chap.dialogue, chap.speaker)}
                                  disabled={isAudioPlaying}
                                  className="h-7 text-xs border-neutral-700 hover:bg-neutral-800 text-neutral-300 gap-1.5"
                                >
                                  {isAudioPlaying ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                                      <span>Hablando...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                                      <span>▷ Escuchar Voz</span>
                                    </>
                                  )}
                                </Button>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => void handleRegenerateSingleChapter(idx)}
                                  disabled={isRegenerating}
                                  className="h-7 text-xs text-neutral-400 hover:text-white gap-1"
                                  title="Regenerar solo esta toma"
                                >
                                  <RotateCcw className={`w-3 h-3 ${isRegenerating ? "animate-spin" : ""}`} />
                                  <span>Regenerar</span>
                                </Button>
                              </div>
                            </div>

                            {/* TOMA VISUAL / BLOCKING */}
                            <div className="space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                Acción / Encuadre de Cámara:
                              </span>
                              <Textarea
                                value={chap.visual}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setChapters((prev) => {
                                    const next = [...prev];
                                    next[idx].visual = val;
                                    return next;
                                  });
                                }}
                                rows={2}
                                className="bg-neutral-900 border-neutral-800 text-xs text-neutral-200 resize-none"
                              />
                            </div>

                            {/* DIÁLOGO CRUZADO */}
                            <div className="space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                                Diálogo Hablado de los Personajes:
                              </span>
                              <Input
                                value={chap.dialogue}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setChapters((prev) => {
                                    const next = [...prev];
                                    next[idx].dialogue = val;
                                    return next;
                                  });
                                }}
                                className="bg-neutral-900 border-neutral-800 text-xs text-white font-medium"
                              />
                            </div>

                            {/* SFX / FOLEY */}
                            {chap.sfx && (
                              <div className="text-[11px] text-neutral-400 italic bg-neutral-900/40 px-3 py-1.5 rounded-lg border border-neutral-850">
                                {chap.sfx}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* BIG FILM & RENDER BUTTON */}
                    <div className="pt-4 border-t border-neutral-800 space-y-4">
                      {/* GPU ENGINE STATUS BANNER */}
                      {localProbe?.status === "ready" ? (
                        <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-400">
                          <div className="flex items-center gap-2.5">
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-sm shadow-emerald-500" />
                            <span className="font-bold text-white">Motor GPU Conectado:</span>
                            <span className="text-neutral-300">ComfyUI + Wan2.1 Activo en GeForce RTX 4060 Ti</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void refreshEngineProbe()}
                            className="h-6 text-[11px] text-emerald-400 hover:text-white px-2 hover:bg-emerald-900/40"
                          >
                            Verificar
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs text-amber-300 gap-3">
                          <div className="flex items-center gap-2.5">
                            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                            <div>
                              <span className="font-bold block text-white">ComfyUI / Kineva está apagado</span>
                              <span className="text-neutral-400 text-[11px]">
                                Abre <strong>Comfy Desktop</strong> en tu equipo para renderizar las escenas con la tarjeta gráfica.
                              </span>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void refreshEngineProbe()}
                            className="h-7 text-xs border-amber-500/50 text-amber-300 hover:bg-amber-900/40 shrink-0"
                          >
                            Comprobar Conexión
                          </Button>
                        </div>
                      )}
                      {isFilming ? (
                        <div className="p-6 rounded-2xl border border-amber-500/50 bg-amber-950/20 text-center space-y-3">
                          <Loader2 className="w-8 h-8 animate-spin mx-auto text-amber-400" />
                          <h4 className="text-base font-bold text-white">
                            Filmando Miniserie en GPU (Wan2.1 + Lip-Sync Activo)...
                          </h4>
                          <p className="text-xs text-neutral-400">
                            Renderizando tomas cinematográficas con consistencia de rostro y sincronización labial.
                          </p>
                          <div className="w-full bg-neutral-800 h-2.5 rounded-full overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-amber-500 to-yellow-400 h-full transition-all duration-500"
                              style={{ width: `${filmingProgress}%` }}
                            />
                          </div>
                          <span className="text-xs text-amber-400 font-bold">{filmingProgress}% Completado</span>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          onClick={() => void handleStartFilming()}
                          className="w-full py-7 text-base font-black bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 text-black hover:opacity-90 shadow-2xl shadow-emerald-500/20 flex items-center justify-center gap-2 rounded-2xl"
                        >
                          <Video className="w-6 h-6 fill-black" />
                          <span>FILMAR Y RENDERIZAR MINISERIE (Kineva Lip-Sync + Wan2.1)</span>
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* ========================================================= */}
                {/* VERTICAL PREVIEW PLAYER (9:16) IF VIDEOS GENERATED        */}
                {/* ========================================================= */}
                {Object.keys(renderedVideos).length > 0 && (
                  <div className="bg-neutral-950 border border-emerald-500/40 rounded-2xl p-6 shadow-2xl space-y-4">
                    <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                          Miniserie Producida - Reproductor 9:16
                        </h3>
                      </div>

                      {/* Episode navigator */}
                      <div className="flex items-center gap-1.5">
                        {Object.keys(renderedVideos).map((epNumStr) => {
                          const epNum = Number(epNumStr);
                          return (
                            <Button
                              key={epNum}
                              type="button"
                              size="sm"
                              variant={activeVideoChapter === epNum ? "default" : "outline"}
                              onClick={() => setActiveVideoChapter(epNum)}
                              className={`text-xs h-7 ${
                                activeVideoChapter === epNum ? "bg-emerald-500 text-black font-bold" : "text-neutral-300"
                              }`}
                            >
                              Cap. {epNum}
                            </Button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Vertical Player Box */}
                    <div className="max-w-xs mx-auto aspect-[9/16] rounded-2xl overflow-hidden bg-black border-2 border-neutral-800 shadow-2xl relative">
                      {renderedVideos[activeVideoChapter] ? (
                        <video
                          key={renderedVideos[activeVideoChapter]}
                          src={renderedVideos[activeVideoChapter]}
                          controls
                          autoPlay
                          playsInline
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-neutral-500 gap-2">
                          <Film className="w-8 h-8" />
                          <span className="text-xs">Selecciona un capítulo</span>
                        </div>
                      )}
                    </div>

                    {renderedVideos[activeVideoChapter] && (
                      <div className="text-center pt-2">
                        <a
                          href={renderedVideos[activeVideoChapter]}
                          download={`${seriesTitle}_Capitulo_${activeVideoChapter}.mp4`}
                          className="inline-flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-white"
                        >
                          <Download className="w-4 h-4" />
                          <span>Descargar Capítulo {activeVideoChapter} en MP4</span>
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* CHARACTER SELECTION MODAL */}
        {modalRole && (
          <CharacterModal
            open={Boolean(modalRole)}
            onOpenChange={(open) => !open && setModalRole(null)}
            userId={user?.id || ""}
            roleTitle={modalRole === "primary" ? "Protagonista" : "Co-Protagonista / Antagonista"}
            currentName={modalRole === "primary" ? primaryName : secondaryName}
            onSelectCharacter={(file, name, preview) => {
              if (modalRole === "primary") {
                setPrimaryImageFile(file);
                if (name && name !== "Actor" && name !== "Actor Guardado") setPrimaryName(name);
                if (preview) setPrimaryPreviewUrl(preview);
              } else {
                setSecondaryImageFile(file);
                if (name && name !== "Actor" && name !== "Actor Guardado") setSecondaryName(name);
                if (preview) setSecondaryPreviewUrl(preview);
              }
              setModalRole(null);
            }}
          />
        )}
      </div>
    </MainLayout>
  );
}
