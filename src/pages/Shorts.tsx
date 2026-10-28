import React, { useState, useMemo, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Play,
  Pause,
  Eye,
  Star,
  Search,
  SlidersHorizontal,
  Flame,
  Plus,
  Loader2,
  Sparkles,
  X,
  Share2,
  Bookmark,
  Volume2,
  VolumeX,
  SkipForward,
  SkipBack,
  ListVideo,
  Clapperboard,
  ExternalLink,
  MessageSquare,
  GitFork,
  Lock,
  Unlock,
  Film,
} from "lucide-react";
import {
  useShorts,
  getSignedVideoUrl,
  type SeriesWithEpisodes,
  type ShortsEpisode,
} from "@/hooks/useShorts";
import { SeriesCover } from "@/components/shorts/SeriesCover";
import { seriesStatus } from "@/lib/shortsCatalog";
import { useAdultMode } from "@/contexts/AdultModeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { invokeFunctionWithRetry } from "@/lib/invokeFunction";
import { uploadKinevaReference } from "@/lib/kinevaReference";
import { toast } from "sonner";

const Shorts = () => {
  const { enabled: adultEnabled } = useAdultMode();
  const { user, isAdmin, isPremium } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const isEs = language === "es";
  const { series, loading, reload } = useShorts(adultEnabled);

  // Estados de navegación y filtros
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedSeries, setSelectedSeries] = useState<SeriesWithEpisodes | null>(null);

  // Estado del modal "Crear Nueva Serie"
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [premise, setPremise] = useState("");
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [category, setCategory] = useState("romance");
  const [isAdult, setIsAdult] = useState(adultEnabled);
  const [episodesCount, setEpisodesCount] = useState(3);

  // Estado del Reproductor de Video Inmersivo
  const [isPlayingVideo, setIsPlayingVideo] = useState<boolean>(false);
  const [currentPlayingSeries, setCurrentPlayingSeries] = useState<SeriesWithEpisodes | null>(null);
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState<number>(0);
  const [currentSignedVideoUrl, setCurrentSignedVideoUrl] = useState<string | null>(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [videoProgress, setVideoProgress] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<string>("0:00");
  const [durationTime, setDurationTime] = useState<string>("0:00");
  const [showEpisodeListInPlayer, setShowEpisodeListInPlayer] = useState<boolean>(false);
  const [savedSeriesIds, setSavedSeriesIds] = useState<string[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Categorías calculadas dinámicamente desde las series reales
  const categoriesList = useMemo(() => {
    const counts: Record<string, number> = {};
    series.forEach((s) => {
      const cat = (s.category || "romance").toLowerCase();
      counts[cat] = (counts[cat] || 0) + 1;
    });

    const items = [
      { id: "all", label: isEs ? "Todas" : "All", count: series.length },
      ...Object.entries(counts).map(([cat, count]) => ({
        id: cat,
        label: cat.charAt(0).toUpperCase() + cat.slice(1),
        count,
      })),
    ];
    return items;
  }, [series, isEs]);

  // Filtrado reactivo en memoria
  const filteredSeries = useMemo(() => {
    return series.filter((item) => {
      const cat = (item.category || "romance").toLowerCase();
      const matchesCategory =
        selectedCategory === "all" || cat === selectedCategory;
      const matchesSearch =
        searchQuery.trim() === "" ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.premise && item.premise.toLowerCase().includes(searchQuery.toLowerCase())) ||
        cat.includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [series, selectedCategory, searchQuery]);

  // Carga y firma de video auténtico desde Supabase Storage
  const loadEpisodeVideo = async (ep: ShortsEpisode) => {
    if (!ep.video_url) {
      setCurrentSignedVideoUrl(null);
      toast.info("Este capítulo aún no tiene video producido.");
      return;
    }
    setIsLoadingVideo(true);
    try {
      const signed = await getSignedVideoUrl(ep.video_url);
      setCurrentSignedVideoUrl(signed);
    } catch {
      toast.error("No se pudo obtener el enlace seguro del video.");
      setCurrentSignedVideoUrl(null);
    } finally {
      setIsLoadingVideo(false);
    }
  };

  // Iniciar reproducción de un episodio real
  const startPlayingEpisode = async (
    targetSeries: SeriesWithEpisodes,
    episodeIndex: number = 0
  ) => {
    if (!targetSeries.episodes || targetSeries.episodes.length === 0) {
      toast.error("Esta serie no tiene capítulos creados.");
      return;
    }
    const isFree = episodeIndex < 2;
    const isUnlocked = isFree || isAdmin || isPremium;
    if (!isUnlocked) {
      toast.info(isEs ? "Episodio exclusivo para miembros VIP" : "VIP Members Exclusive Episode", {
        description: isEs
          ? "Desbloquea todos los capítulos con el Pase VIP Insomnia."
          : "Unlock all full episodes with the Insomnia VIP Pass.",
        action: {
          label: isEs ? "Ver Planes" : "View Plans",
          onClick: () => navigate("/plans"),
        },
      });
      return;
    }
    const episode = targetSeries.episodes[episodeIndex];
    if (!episode) return;

    setCurrentPlayingSeries(targetSeries);
    setCurrentEpisodeIndex(episodeIndex);
    setSelectedSeries(null); // Cerrar modal de preview si estaba abierto
    setIsPlayingVideo(true);
    setIsPaused(false);
    setVideoProgress(0);

    await loadEpisodeVideo(episode);
  };

  // Cambiar de episodio
  const handleSelectEpisodeInPlayer = async (idx: number) => {
    if (!currentPlayingSeries) return;
    const isFree = idx < 2;
    const isUnlocked = isFree || isAdmin || isPremium;
    if (!isUnlocked) {
      toast.info(isEs ? "Episodio exclusivo para miembros VIP" : "VIP Members Exclusive Episode", {
        description: isEs
          ? "Desbloquea todos los capítulos con el Pase VIP Insomnia."
          : "Unlock all full episodes with the Insomnia VIP Pass.",
        action: {
          label: isEs ? "Ver Planes" : "View Plans",
          onClick: () => navigate("/plans"),
        },
      });
      return;
    }
    const ep = currentPlayingSeries.episodes[idx];
    if (!ep) return;
    setCurrentEpisodeIndex(idx);
    setShowEpisodeListInPlayer(false);
    setVideoProgress(0);
    await loadEpisodeVideo(ep);
  };

  const handleNextEpisode = async () => {
    if (!currentPlayingSeries) return;
    if (currentEpisodeIndex < currentPlayingSeries.episodes.length - 1) {
      await handleSelectEpisodeInPlayer(currentEpisodeIndex + 1);
    } else {
      toast.info("Has llegado al último capítulo de esta serie.");
    }
  };

  const handlePrevEpisode = async () => {
    if (currentEpisodeIndex > 0) {
      await handleSelectEpisodeInPlayer(currentEpisodeIndex - 1);
    }
  };

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPaused(false);
    } else {
      videoRef.current.pause();
      setIsPaused(true);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  const formatSeconds = (sec: number) => {
    if (isNaN(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const onTimeUpdate = () => {
    if (!videoRef.current) return;
    const current = videoRef.current.currentTime;
    const total = videoRef.current.duration;
    if (total > 0) {
      setVideoProgress((current / total) * 100);
      setCurrentTime(formatSeconds(current));
      setDurationTime(formatSeconds(total));
    }
  };

  const toggleSaveSeries = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSavedSeriesIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
    toast.success(
      savedSeriesIds.includes(id)
        ? "Eliminado de tu lista"
        : "Guardado en tu lista de seguimiento"
    );
  };

  // Creación de nueva serie real en Supabase con IA
  const handleCreateSeries = async () => {
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
        "generate-shorts-series",
        { premise, category, isAdult, episodes: episodesCount, referencePath }
      );
      if (error || data?.error) {
        throw new Error(data?.message || data?.error || error?.message || "No se pudo generar la serie");
      }
      toast.success("¡Serie creada exitosamente! Los capítulos se han generado.");
      setCreateOpen(false);
      setPremise("");
      setReferenceImage(null);
      reload();
    } catch (err: any) {
      toast.error(err?.message || "Error al crear la serie");
    } finally {
      setCreating(false);
    }
  };

  // Atajos de teclado en el reproductor
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlayingVideo) return;
      if (e.key === "Escape") {
        setIsPlayingVideo(false);
      } else if (e.key === " ") {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key === "m" || e.key === "M") {
        toggleMute();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlayingVideo]);

  const currentEpisode: ShortsEpisode | undefined =
    currentPlayingSeries?.episodes[currentEpisodeIndex];

  return (
    <MainLayout>
      <div className="min-h-screen bg-[#131313] text-neutral-100 font-sans selection:bg-[#ff2d78] selection:text-white pb-20">
        
        {/* =========================================================================
            HEADER DE SECCIÓN & HERO COMPACTO (Estilo Candy Shorts / Insomnia)
           ========================================================================= */}
        <section className="border-b border-[#262626] bg-gradient-to-b from-[#181818] to-[#131313]">
          <div className="container mx-auto px-4 lg:px-8 py-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#1f1f1f] border border-[#363636] text-[11px] font-semibold text-[#ff2d78] mb-2 tracking-wide uppercase">
                  <Flame className="w-3.5 h-3.5 fill-[#ff2d78]" />
                  <span>Candy Shorts Experience</span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white flex items-center gap-3">
                  {isEs ? "Series Cortas & Episodios" : "Short Series & Episodes"}
                </h1>
                <p className="text-sm text-neutral-400 mt-1 max-w-2xl leading-relaxed">
                  {isEs
                    ? "Tus historias reales producidas en formato vertical 9:16. Haz clic en cualquier portada para abrir el reproductor inmersivo o gestionar la producción de capítulos."
                    : "Your real stories produced in vertical 9:16 format. Click any cover to open the immersive player or manage episode production."}
                </p>
              </div>

              {/* Botón "+ Nueva Serie" y Buscador */}
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 w-full md:w-auto">
                <div className="relative flex-1 md:w-72">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <Input
                    type="text"
                    placeholder={isEs ? "Buscar en tus series..." : "Search your series..."}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-9 bg-[#1f1f1f] border-[#363636] text-white placeholder:text-neutral-500 rounded-full h-10 text-xs sm:text-sm focus-visible:ring-1 focus-visible:ring-[#ff2d78] focus-visible:border-[#ff2d78]"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Diálogo Modal de Creación de Serie */}
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                  <DialogTrigger asChild>
                    <Button className="rounded-full bg-gradient-to-r from-[#ff2d78] to-[#e93d82] hover:opacity-90 text-white font-semibold text-xs sm:text-sm h-10 px-5 shadow-lg shadow-[#ff2d78]/25 flex items-center gap-1.5 cursor-pointer">
                      <Plus className="w-4 h-4" />
                      <span>{isEs ? "Nueva Serie" : "New Series"}</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md bg-[#181818] border-[#363636] text-white rounded-2xl">
                    <DialogHeader>
                      <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-[#ff2d78]" />
                        <span>{isEs ? "Crear Serie de Shorts" : "Create Shorts Series"}</span>
                      </DialogTitle>
                      <DialogDescription className="text-neutral-400 text-xs">
                        {isEs
                          ? "La IA redactará los guiones de cada capítulo y creará la portada vertical para tu catálogo."
                          : "AI will write each episode's script and create the vertical cover for your catalog."}
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 pt-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-neutral-300">
                          {isEs ? "Premisa / Historia" : "Premise / Story"}
                        </Label>
                        <Textarea
                          value={premise}
                          onChange={(e) => setPremise(e.target.value)}
                          rows={3}
                          className="bg-[#222] border-[#363636] rounded-xl text-xs text-white placeholder:text-neutral-500"
                          placeholder={isEs ? "Dos colegas de trabajo se quedan encerrados en la azotea del rascacielos durante una tormenta..." : "Two coworkers get trapped on the rooftop of a skyscraper during a rainstorm..."}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="reference-img" className="text-xs font-semibold text-neutral-300">
                          {isEs ? "Foto de referencia para personajes (opcional)" : "Character reference photo (optional)"}
                        </Label>
                        <Input
                          id="reference-img"
                          type="file"
                          accept="image/*"
                          onChange={(e) => setReferenceImage(e.target.files?.[0] || null)}
                          className="bg-[#222] border-[#363636] rounded-xl text-xs text-white file:text-xs file:bg-[#333] file:text-white file:rounded-lg file:border-0"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-neutral-300">{isEs ? "Categoría" : "Category"}</Label>
                          <Input
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="bg-[#222] border-[#363636] rounded-xl text-xs text-white"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-neutral-300">{isEs ? "Capítulos" : "Episodes"}</Label>
                          <Input
                            type="number"
                            min={1}
                            max={6}
                            value={episodesCount}
                            onChange={(e) => setEpisodesCount(Number(e.target.value))}
                            className="bg-[#222] border-[#363636] rounded-xl text-xs text-white"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-xl bg-[#222] border border-[#333]">
                        <div>
                          <p className="text-xs font-semibold text-white">{isEs ? "Contenido 18+" : "18+ Content"}</p>
                          <p className="text-[11px] text-neutral-400">{isEs ? "Tensión adulta sugerida" : "Suggested adult themes"}</p>
                        </div>
                        <Switch checked={isAdult} onCheckedChange={setIsAdult} />
                      </div>

                      <Button
                        onClick={handleCreateSeries}
                        disabled={creating}
                        className="w-full rounded-xl bg-gradient-to-r from-[#ff2d78] to-[#e93d82] text-white font-bold h-11 text-xs sm:text-sm"
                      >
                        {creating ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            <span>{isEs ? "Generando serie con IA..." : "Generating series with AI..."}</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 mr-2" />
                            <span>{isEs ? "Generar y Publicar Serie" : "Generate & Publish Series"}</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* =========================================================================
                BARRA HORIZONTAL DESLIZABLE DE CATEGORÍAS (PILLS CAROUSEL)
               ========================================================================= */}
            <div className="mt-6 pt-4 border-t border-[#262626]/60">
              <div className="relative flex items-center">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth py-1 w-full">
                  {categoriesList.map((cat) => {
                    const isActive = selectedCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap flex items-center gap-2 cursor-pointer select-none ${
                          isActive
                            ? "bg-gradient-to-r from-[#ff2d78] to-[#e93d82] text-white font-semibold shadow-lg shadow-[#ff2d78]/25 scale-105 border-transparent"
                            : "bg-[#1f1f1f] text-neutral-400 hover:text-white hover:bg-[#282828] border border-[#363636]"
                        }`}
                      >
                        <span>{cat.label}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                            isActive
                              ? "bg-black/30 text-white"
                              : "bg-[#131313] text-neutral-500"
                          }`}
                        >
                          {cat.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            CONTENEDOR PRINCIPAL: REJILLA VERTICAL (9:16)
           ========================================================================= */}
        <main className="container mx-auto px-4 lg:px-8 py-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 text-xs sm:text-sm text-neutral-400">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#ff2d78]" />
              <span>
                {isEs ? "Mostrando " : "Showing "}
                <strong className="text-white font-semibold">
                  {filteredSeries.length}
                </strong>{" "}
                {filteredSeries.length === 1 ? (isEs ? "serie" : "series") : (isEs ? "series" : "series")}
              </span>
              {selectedCategory !== "all" && (
                <span className="text-[#ff2d78] font-medium">
                  • {isEs ? "Categoría: " : "Category: "}
                  {categoriesList.find((c) => c.id === selectedCategory)?.label}
                </span>
              )}
            </div>

            {selectedCategory !== "all" && (
              <button
                onClick={() => setSelectedCategory("all")}
                className="text-xs text-neutral-400 hover:text-white underline cursor-pointer"
              >
                {isEs ? "Limpiar filtro" : "Clear filter"}
              </button>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl aspect-[9/16] bg-[#1c1c1c] animate-pulse border border-[#2b2b2b]"
                />
              ))}
            </div>
          ) : filteredSeries.length === 0 ? (
            <div className="py-20 text-center rounded-2xl bg-[#191919] border border-[#2d2d2d] max-w-lg mx-auto p-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#262626] border border-[#363636] flex items-center justify-center text-3xl">
                🎬
              </div>
              <h3 className="text-white text-lg font-bold mb-1">
                {isEs ? "No hay series en esta sección" : "No series found in this section"}
              </h3>
              <p className="text-sm text-neutral-400 mb-6">
                {isEs
                  ? "Crea tu primera serie con el botón superior para que la IA genere los guiones y capítulos."
                  : "Create your first series with the button above to let AI craft scripts and episodes."}
              </p>
              <Button
                onClick={() => setCreateOpen(true)}
                className="rounded-full bg-gradient-to-r from-[#ff2d78] to-[#e93d82] text-white font-semibold px-6"
              >
                <Plus className="w-4 h-4 mr-2" />
                {isEs ? "Crear Mi Primera Serie" : "Create My First Series"}
              </Button>
            </div>
          ) : (
            /* Cuadrícula de Shorts Auténticos en Proporción 9:16 */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-4 md:gap-5">
              {filteredSeries.map((item, idx) => {
                const status = seriesStatus(item.episodes);
                const isSaved = savedSeriesIds.includes(item.id);
                const readyEpisodesCount = item.episodes.filter(
                  (ep) => Boolean(ep.video_url) && ep.status === "ready"
                ).length;

                return (
                  <article
                    key={item.id}
                    onClick={() => setSelectedSeries(item)}
                    className="group relative rounded-2xl overflow-hidden aspect-[9/16] bg-[#1a1a1a] border border-[#2b2b2b] hover:border-[#ff2d78] transition-all duration-300 hover:shadow-2xl hover:shadow-[#ff2d78]/20 hover:-translate-y-1.5 cursor-pointer flex flex-col justify-end p-3.5 select-none"
                    style={{ animationDelay: `${idx * 40}ms` }}
                  >
                    {/* Portada Dinámica / Video Loop (SeriesCover Real) */}
                    <div className="absolute inset-0 w-full h-full overflow-hidden bg-neutral-900">
                      <SeriesCover
                        series={item}
                        className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                      />
                    </div>

                    {/* Capas de Sombras y Gradientes para Legibilidad */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e0e] via-[#0e0e0e]/45 to-transparent pointer-events-none" />
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors pointer-events-none" />

                    {/* Etiquetas Superiores Flotantes */}
                    <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between z-10 pointer-events-none">
                      <span className="bg-[#ff2d78] text-white text-[10px] font-black tracking-wider px-2 py-0.5 rounded-md shadow-md uppercase">
                        {item.category || "SERIE"}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {item.is_adult && (
                          <span className="bg-gradient-to-r from-red-600 via-rose-600 to-pink-600 text-white text-[10px] font-black tracking-wider px-2 py-0.5 rounded shadow-lg shadow-pink-600/30 flex items-center gap-1">
                            <Flame className="w-3 h-3 fill-white" />
                            SPICY 18+
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => toggleSaveSeries(e, item.id)}
                          className="w-6 h-6 rounded-full bg-black/70 backdrop-blur-md flex items-center justify-center text-white/80 hover:text-[#ff2d78] pointer-events-auto transition-colors border border-white/10"
                        >
                          <Bookmark
                            className={`w-3 h-3 ${
                              isSaved ? "fill-[#ff2d78] text-[#ff2d78]" : ""
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Botón Central de Play Flotante */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-75 group-hover:scale-100 pointer-events-none z-10">
                      <div className="w-12 h-12 rounded-full bg-[#ff2d78] text-white flex items-center justify-center shadow-xl shadow-[#ff2d78]/50 ring-4 ring-white/20">
                        <Play className="w-5 h-5 ml-0.5 fill-white" />
                      </div>
                    </div>

                    {/* Base de la Tarjeta con Metadatos */}
                    <div className="relative z-10 space-y-1">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#ff2d78]">
                        <span>{status.label}</span>
                        <span className="text-neutral-500">•</span>
                        <span className="text-neutral-300">
                          {item.episodes.length} {item.episodes.length === 1 ? (isEs ? "Capítulo" : "Episode") : (isEs ? "Capítulos" : "Episodes")}
                        </span>
                      </div>

                      <h3 className="text-white font-bold text-sm leading-snug line-clamp-2 group-hover:text-[#ff2d78] transition-colors">
                        {item.title}
                      </h3>

                      <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1">
                        <span className="text-emerald-400 font-semibold text-[10px]">
                          {readyEpisodesCount} {isEs ? "con video listo" : "ready with video"}
                        </span>
                        <span className="text-xs text-neutral-400 group-hover:text-white transition-colors flex items-center gap-1 font-medium">
                          {isEs ? "Abrir" : "Open"} &rarr;
                        </span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>

        {/* =========================================================================
            MODAL DE DETALLES Y CAPÍTULOS DE LA SERIE REAL
           ========================================================================= */}
        <Dialog
          open={Boolean(selectedSeries)}
          onOpenChange={(open) => {
            if (!open) setSelectedSeries(null);
          }}
        >
          <DialogContent className="max-w-3xl bg-[#181818] border-[#363636] text-white p-0 overflow-hidden rounded-2xl shadow-2xl">
            {selectedSeries && (
              <div className="flex flex-col md:flex-row max-h-[85vh] overflow-y-auto md:overflow-hidden">
                
                {/* Lateral Izquierdo: Portada Real y Botón Directo al Reproductor */}
                <div className="relative w-full md:w-5/12 aspect-[9/16] md:aspect-auto bg-[#131313] flex items-center justify-center overflow-hidden">
                  <SeriesCover
                    series={selectedSeries}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent pointer-events-none" />
                  
                  <div className="absolute bottom-5 inset-x-5 text-center z-10 space-y-2">
                    <Button
                      onClick={() => startPlayingEpisode(selectedSeries, 0)}
                      className="w-full rounded-full bg-gradient-to-r from-[#ff2d78] to-[#e93d82] hover:opacity-95 text-white font-bold py-6 text-sm shadow-xl shadow-[#ff2d78]/50 flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-transform"
                    >
                      <Play className="w-5 h-5 fill-white" />
                      <span>{isEs ? "Reproducir Episodio 1" : "Play Episode 1"}</span>
                    </Button>

                    <Link
                      to={`/shorts/${selectedSeries.id}`}
                      className="inline-flex items-center justify-center gap-1 text-[11px] text-neutral-400 hover:text-white transition-colors"
                    >
                      <Clapperboard className="w-3 h-3" />
                      <span>{isEs ? "Ver panel de rodaje / ComfyUI" : "View Studio & ComfyUI"}</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </Link>
                  </div>
                </div>

                {/* Lateral Derecho: Detalles y Lista de Episodios Reales */}
                <div className="p-6 md:p-7 flex-1 flex flex-col justify-between space-y-4 bg-[#181818]">
                  <DialogHeader className="text-left space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="bg-[#ff2d78] text-white text-[10px] font-black tracking-wider px-2 py-0.5 rounded uppercase">
                        {selectedSeries.category || (isEs ? "HISTORIA" : "STORY")}
                      </span>
                      {selectedSeries.is_adult && (
                        <span className="bg-gradient-to-r from-red-600 via-rose-600 to-pink-600 text-white text-xs font-black tracking-wider px-2.5 py-0.5 rounded shadow flex items-center gap-1">
                          <Flame className="w-3.5 h-3.5 fill-white" />
                          {isEs ? "SPICY 18+ ADULTO" : "SPICY 18+ MATURE"}
                        </span>
                      )}
                      <span className="text-xs text-neutral-500">•</span>
                      <span className="text-xs text-neutral-400">
                        {selectedSeries.episodes.length} {isEs ? "Episodios" : "Episodes"}
                      </span>
                    </div>

                    <DialogTitle className="text-xl sm:text-2xl font-extrabold text-white leading-tight">
                      {selectedSeries.title}
                    </DialogTitle>
                  </DialogHeader>

                  {selectedSeries.premise && (
                    <p className="text-sm text-neutral-300 leading-relaxed bg-[#1f1f1f] p-3.5 rounded-xl border border-[#2d2d2d]">
                      {selectedSeries.premise}
                    </p>
                  )}

                  {/* Lista de Capítulos Reales */}
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center justify-between text-xs font-semibold text-neutral-400">
                      <span>{isEs ? `CAPÍTULOS (${selectedSeries.episodes.length})` : `EPISODES (${selectedSeries.episodes.length})`}</span>
                      <span className="text-neutral-500">{isEs ? "Haz clic en cualquiera para reproducir" : "Click any episode to play"}</span>
                    </div>

                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {selectedSeries.episodes.map((ep, idx) => {
                        const hasVideo = Boolean(ep.video_url);
                        const isFree = idx < 2;
                        const isUnlocked = isFree || isAdmin || isPremium;
                        return (
                          <button
                            key={ep.id}
                            type="button"
                            onClick={() => startPlayingEpisode(selectedSeries, idx)}
                            className="w-full flex items-center justify-between p-3 rounded-xl text-xs transition-all cursor-pointer bg-[#202020] hover:bg-[#ff2d78]/15 hover:border-[#ff2d78]/50 border border-[#2e2e2e] text-neutral-200 group text-left"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-6 h-6 rounded-full bg-[#181818] border border-[#363636] group-hover:border-[#ff2d78] group-hover:bg-[#ff2d78] flex items-center justify-center transition-colors">
                                {isUnlocked ? (
                                  <Play className="w-3 h-3 ml-0.5 fill-current text-neutral-400 group-hover:text-white" />
                                ) : (
                                  <Lock className="w-3 h-3 text-amber-400" />
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold group-hover:text-white transition-colors">
                                    {isEs ? "Ep." : "Ep."} {ep.episode_number}: {ep.title}
                                  </p>
                                  {isFree ? (
                                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                      {isEs ? "GRATIS" : "FREE"}
                                    </span>
                                  ) : !isUnlocked ? (
                                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-0.5">
                                      <Lock className="w-2.5 h-2.5" /> VIP
                                    </span>
                                  ) : (
                                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                      VIP PASS
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-neutral-400 line-clamp-1 max-w-xs">
                                  {ep.script.slice(0, 60)}...
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {hasVideo ? (
                                <span className="text-emerald-400 font-bold text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                                  {isEs ? "VER VIDEO" : "WATCH VIDEO"}
                                </span>
                              ) : (
                                <span className="text-amber-400 font-semibold text-[10px] px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                                  {isEs ? "GUION" : "SCRIPT"}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Acciones del pie */}
                  <div className="pt-2 flex items-center gap-3">
                    <Button
                      variant="outline"
                      onClick={(e) => toggleSaveSeries(e, selectedSeries.id)}
                      className="flex-1 rounded-full border-[#363636] bg-[#222] hover:bg-[#2c2c2c] text-white text-xs h-10"
                    >
                      <Bookmark className="w-3.5 h-3.5 mr-1.5" />
                      {savedSeriesIds.includes(selectedSeries.id) ? (isEs ? "En Mi Lista" : "In My List") : (isEs ? "Guardar" : "Save")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard?.writeText(window.location.href);
                        toast.success("Enlace copiado al portapapeles");
                      }}
                      className="rounded-full border-[#363636] bg-[#222] hover:bg-[#2c2c2c] text-white text-xs h-10 px-4"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* =========================================================================
            REPRODUCTOR DE VIDEO CANDY SHORTS INMERSIVO (9:16 CON VIDEO REAL)
           ========================================================================= */}
        {isPlayingVideo && currentPlayingSeries && currentEpisode && (
          <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-xl flex items-center justify-center p-0 md:p-6 animate-fadeIn select-none">
            
            {/* Contenedor del Reproductor Vertical 9:16 */}
            <div className="relative w-full h-full md:max-w-md md:h-[90vh] bg-black md:rounded-3xl overflow-hidden shadow-2xl border border-neutral-800 flex flex-col justify-between">
              
              {/* VIDEO REAL (HTML5 Video Element con URL firmada de Supabase) */}
              {currentSignedVideoUrl ? (
                <video
                  ref={videoRef}
                  src={currentSignedVideoUrl}
                  className="absolute inset-0 w-full h-full object-cover cursor-pointer"
                  autoPlay
                  playsInline
                  loop
                  onClick={togglePlayPause}
                  onTimeUpdate={onTimeUpdate}
                  onError={() => {
                    toast.error("Error al reproducir el video. Verificando URL...");
                  }}
                />
              ) : (
                /* Vista de Guion / Pendiente si aún no tiene video renderizado */
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-neutral-900 via-black to-neutral-950">
                  <div className="w-16 h-16 rounded-full bg-[#1f1f1f] border border-[#363636] flex items-center justify-center text-3xl mb-4 text-[#ff2d78]">
                    🎬
                  </div>
                  <h4 className="text-white font-bold text-lg mb-2">
                    {currentEpisode.title}
                  </h4>
                  <p className="text-neutral-400 text-xs max-w-sm mb-6 leading-relaxed italic">
                    "{currentEpisode.script}"
                  </p>
                  <p className="text-amber-400 text-xs font-semibold mb-4">
                    {isEs ? `Este capítulo aún está en estado: ${currentEpisode.status}` : `This episode is currently in status: ${currentEpisode.status}`}
                  </p>
                  <Link
                    to={`/shorts/${currentPlayingSeries.id}`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#ff2d78] text-white text-xs font-semibold rounded-full hover:opacity-90 transition-opacity"
                  >
                    <Clapperboard className="w-4 h-4" />
                    <span>{isEs ? "Filmar / Generar video con ComfyUI" : "Film / Generate video with ComfyUI"}</span>
                  </Link>
                </div>
              )}

              {/* Loader de carga de video firmado */}
              {isLoadingVideo && (
                <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                  <div className="text-center space-y-2">
                    <Loader2 className="w-8 h-8 text-[#ff2d78] animate-spin mx-auto" />
                    <p className="text-xs text-white font-medium">{isEs ? "Obteniendo video seguro..." : "Fetching secure video stream..."}</p>
                  </div>
                </div>
              )}

              {/* Barra de Oscurecimiento Superior e Inferior para Controles */}
              <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-none" />
              <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none" />

              {/* Barra Superior del Reproductor */}
              <div className="relative z-20 flex items-center justify-between p-4 text-white">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-bold tracking-wider uppercase text-neutral-300">
                    {isEs ? "Capítulo" : "Episode"} {currentEpisode.episode_number} {isEs ? "de" : "of"} {currentPlayingSeries.episodes.length}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleMute}
                    className="w-9 h-9 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/90 transition-colors border border-white/10"
                    title={isMuted ? (isEs ? "Activar sonido" : "Unmute") : (isEs ? "Silenciar" : "Mute")}
                  >
                    {isMuted ? (
                      <VolumeX className="w-4 h-4 text-rose-400" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>

                  <Link
                    to={`/chat?series=${encodeURIComponent(currentPlayingSeries.title)}&character=${encodeURIComponent(currentPlayingSeries.title)}&premise=${encodeURIComponent(currentPlayingSeries.premise || '')}&avatar=${encodeURIComponent(currentPlayingSeries.cover_url || '')}&adult=${currentPlayingSeries.is_adult ? '1' : '0'}`}
                    className="h-9 px-3 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center gap-1.5 text-xs font-semibold text-white hover:bg-[#ff2d78]/30 transition-colors border border-white/10"
                    title={isEs ? "Chatear con el personaje de esta serie" : "Chat with this character"}
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-[#ff2d78]" />
                    <span className="hidden sm:inline">{isEs ? "Chatear" : "Chat"}</span>
                  </Link>

                  <Link
                    to={`/studio?remix=${currentPlayingSeries.id}&title=${encodeURIComponent(currentPlayingSeries.title)}&premise=${encodeURIComponent(currentPlayingSeries.premise || '')}&category=${encodeURIComponent(currentPlayingSeries.category || '')}&adult=${currentPlayingSeries.is_adult ? '1' : '0'}`}
                    className="h-9 px-3 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center gap-1.5 text-xs font-semibold text-white hover:bg-purple-600/30 transition-colors border border-white/10"
                    title={isEs ? "Hacer Remix o Spin-off en Studio" : "Remix / Spin-off in Studio"}
                  >
                    <GitFork className="w-3.5 h-3.5 text-purple-400" />
                    <span className="hidden sm:inline">{isEs ? "Remix" : "Remix"}</span>
                  </Link>

                  <button
                    onClick={() => setShowEpisodeListInPlayer((prev) => !prev)}
                    className="w-9 h-9 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/90 transition-colors border border-white/10"
                    title={isEs ? "Lista de capítulos" : "Episode list"}
                  >
                    <ListVideo className="w-4 h-4 text-[#ff2d78]" />
                  </button>

                  <button
                    onClick={() => setIsPlayingVideo(false)}
                    className="w-9 h-9 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white hover:bg-rose-600 transition-colors border border-white/10"
                    title={isEs ? "Cerrar reproductor (Esc)" : "Close player (Esc)"}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Botón Central Flotante de Pausa/Play cuando está pausado */}
              {isPaused && currentSignedVideoUrl && (
                <div
                  onClick={togglePlayPause}
                  className="absolute inset-0 flex items-center justify-center z-20 bg-black/30 cursor-pointer"
                >
                  <div className="w-16 h-16 rounded-full bg-[#ff2d78] text-white flex items-center justify-center shadow-2xl scale-110 ring-4 ring-white/20">
                    <Play className="w-7 h-7 ml-1 fill-white" />
                  </div>
                </div>
              )}

              {/* Drawer Lateral de Capítulos Dentro del Reproductor */}
              {showEpisodeListInPlayer && (
                <div className="absolute inset-x-0 bottom-0 top-16 z-30 bg-[#141414]/95 backdrop-blur-xl p-5 overflow-y-auto animate-fadeIn border-t border-neutral-800">
                  <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-4">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <ListVideo className="w-4 h-4 text-[#ff2d78]" />
                      <span>{isEs ? "Capítulos de la Serie" : "Series Episodes"}</span>
                    </h4>
                    <button
                      onClick={() => setShowEpisodeListInPlayer(false)}
                      className="text-neutral-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-2">
                    {currentPlayingSeries.episodes.map((ep, idx) => (
                      <button
                        key={ep.id}
                        onClick={() => handleSelectEpisodeInPlayer(idx)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl text-xs transition-colors cursor-pointer text-left ${
                          idx === currentEpisodeIndex
                            ? "bg-[#ff2d78] text-white font-bold shadow-lg shadow-[#ff2d78]/30"
                            : "bg-[#202020] hover:bg-[#282828] text-neutral-300 border border-[#2d2d2d]"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[11px] opacity-75">
                            #{String(ep.episode_number).padStart(2, "0")}
                          </span>
                          <span className="line-clamp-1">{ep.title}</span>
                        </div>
                        <span className="text-[11px] opacity-80">
                          {ep.video_url ? "Video listo" : "Guion"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Barra Inferior con Información y Controles de Reproducción */}
              <div className="relative z-20 p-4 space-y-3">
                {/* Título de la Serie y Capítulo */}
                <div>
                  <span className="text-[11px] font-bold text-[#ff2d78] uppercase tracking-wider">
                    {currentPlayingSeries.category || "SERIE"}
                  </span>
                  <h3 className="text-base font-bold text-white leading-snug">
                    {currentPlayingSeries.title}
                  </h3>
                  <p className="text-xs text-neutral-300 font-medium mt-0.5">
                    Episodio {currentEpisode.episode_number}: {currentEpisode.title}
                  </p>
                </div>

                {/* Barra de Progreso Interactiva */}
                {currentSignedVideoUrl && (
                  <div className="space-y-1">
                    <div
                      onClick={(e) => {
                        if (!videoRef.current) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const clickPos = (e.clientX - rect.left) / rect.width;
                        videoRef.current.currentTime = clickPos * videoRef.current.duration;
                      }}
                      className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden cursor-pointer relative"
                    >
                      <div
                        className="h-full bg-gradient-to-r from-[#ff2d78] to-[#e93d82] rounded-full transition-all duration-100"
                        style={{ width: `${videoProgress}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-neutral-400 font-mono">
                      <span>{currentTime}</span>
                      <span>{durationTime}</span>
                    </div>
                  </div>
                )}

                {/* Botones de Control: Anterior, Play/Pause, Siguiente */}
                <div className="flex items-center justify-between pt-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handlePrevEpisode}
                    disabled={currentEpisodeIndex === 0}
                    className="w-10 h-10 rounded-full bg-black/60 text-white hover:bg-neutral-800 disabled:opacity-40"
                    title="Episodio anterior"
                  >
                    <SkipBack className="w-4 h-4" />
                  </Button>

                  {currentSignedVideoUrl && (
                    <Button
                      onClick={togglePlayPause}
                      className="w-12 h-12 rounded-full bg-gradient-to-r from-[#ff2d78] to-[#e93d82] text-white hover:opacity-95 shadow-xl shadow-[#ff2d78]/40"
                    >
                      {isPaused ? (
                        <Play className="w-5 h-5 ml-0.5 fill-white" />
                      ) : (
                        <Pause className="w-5 h-5 fill-white" />
                      )}
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleNextEpisode}
                    disabled={
                      currentEpisodeIndex === currentPlayingSeries.episodes.length - 1
                    }
                    className="w-10 h-10 rounded-full bg-black/60 text-white hover:bg-neutral-800 disabled:opacity-40"
                    title="Siguiente episodio"
                  >
                    <SkipForward className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </MainLayout>
  );
};

export default Shorts;
