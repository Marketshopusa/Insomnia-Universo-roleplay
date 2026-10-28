import { invokeFunctionWithRetry } from "@/lib/invokeFunction";
import { generateSceneImage } from "@/lib/sceneImage";
import { attachFinishedVideos, publishLocalChapters } from "@/lib/chapterVideo";
import { uploadKinevaReference } from "@/lib/kinevaReference";
import { splitKinevaDialogue } from "@/lib/kinevaDialogue";
import { CastGallery } from "@/components/studio/CastGallery";
import { StudioProduction, type ProductionSeries } from "@/components/studio/StudioProduction";
import { StudioPresetDirector } from "@/components/studio/StudioPresetDirector";
import { saveNovelSeries } from "@/lib/saveNovelSeries";
import { supabase } from "@/integrations/supabase/client";
import {
  createLocalJob,
  encodeLocalImage,
  fetchLocalJob,
  localVideoSrc,
  loopbackInit,
  probeLocalKineva,
  reviewLocalJob,
  LOCAL_KINEVA_URL,
  type LocalJob,
  type LocalProbe,
  type LocalStudioStatus,
} from "@/lib/kinevaLocal";
import { useEffect, useRef, useState } from "react";
import { Clapperboard, Loader2, Sparkles, Plus, Trash2, Camera, UserPlus, Users, Film, ShieldAlert, Sparkle, Save, MapPin, Box, GitFork } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type StudioGenre } from "@/lib/studioPresets";

export type CastSlotRole = "protagonist" | "secondary" | "antagonist" | "key_object" | "location";

export interface CustomCastItem {
  id: string;
  name: string;
  role: CastSlotRole;
  file?: File | null;
  description?: string;
}

 import { MainLayout } from "@/components/layout/MainLayout";
 import { Button } from "@/components/ui/button";
 import { Textarea } from "@/components/ui/textarea";
 import { Label } from "@/components/ui/label";
 import { Switch } from "@/components/ui/switch";
 import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
 } from "@/components/ui/select";
 import { Card } from "@/components/ui/card";
 import { Badge } from "@/components/ui/badge";
 import { useAuth } from "@/contexts/AuthContext";
 import { useNovelProjects, useCreateNovelProject, useUpdateNovelProject, useDeleteNovelProject } from "@/hooks/useNovelProjects";
 import { novelFromProject } from "@/lib/novelProject";
 import { useToast } from "@/hooks/use-toast";
 import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
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

const models = [
  { value: "wan-2.1", label: "Wan 2.1 I2V (Ultra Fotorrealismo y Física)" },
  { value: "master-pro", label: "Kineva Director (Cinematográfico Episódico)" },
  { value: "apprentice-6", label: "LTX-Video (Render Rápido)" },
  { value: "sage-elite", label: "Sage Elite (Máxima Calidad Multi-toma)" },
];

const languages = [
  "English", "Spanish", "French", "German", "Italian",
  "Portuguese", "Japanese", "Korean", "Chinese"
];

const chapterOptions = [3, 5, 7, 10, 12, 15, 20];

function extractDialogueFromText(text: string): string {
  if (!text) return "";
  const match = text.match(/["'«»]([^"'«»]{4,140})["'«»]/);
  if (match) return match[1].trim();
  const dashMatch = text.match(/—\s*([^—\n]{4,140})/);
  if (dashMatch) return dashMatch[1].trim();
  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 5);
  if (sentences.length > 0) {
    return sentences[0].split(/\s+/).slice(0, 14).join(" ");
  }
  return "";
}

 const Studio = () => {
   const { user } = useAuth();
   const { toast } = useToast();
  const { t } = useLanguage();
   const { data: projects, isLoading: projectsLoading } = useNovelProjects();
   const createProject = useCreateNovelProject();
   const updateProject = useUpdateNovelProject();
   const deleteProject = useDeleteNovelProject();

  const [model, setModel] = useState("wan-2.1");
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [primaryName, setPrimaryName] = useState("");
  const [secondaryName, setSecondaryName] = useState("");
  const [secondaryImage, setSecondaryImage] = useState<File | null>(null);
  const [supportingCast, setSupportingCast] = useState<{ name: string; file: File }[]>([]);
  const [locationName, setLocationName] = useState("");
  const [locationDescription, setLocationDescription] = useState("");
  const [locationImage, setLocationImage] = useState<File | null>(null);
  const [seriesEpisodeIds, setSeriesEpisodeIds] = useState<string[]>([]);
  const [savedSeriesId, setSavedSeriesId] = useState<string | null>(null);
  const [productionRefresh, setProductionRefresh] = useState(0);
  const [localHealth, setLocalHealth] = useState<LocalStudioStatus>("missing-worker");
  const [localJob, setLocalJob] = useState<LocalJob | null>(null);
  const [creativity, setCreativity] = useState("balanced");
  const [description, setDescription] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [chapterCount, setChapterCount] = useState(7);
  const [studioGenre, setStudioGenre] = useState<StudioGenre>("adult");
  const [manualScenes, setManualScenes] = useState<string[]>(Array(7).fill(""));
  const [manualLines, setManualLines] = useState<string[]>(Array(7).fill(""));
  const [manualSpeakers, setManualSpeakers] = useState<string[]>(Array(7).fill(""));
  const [chapterSubShots, setChapterSubShots] = useState<Record<number, { id: string; visual: string; dialogue: string; speaker: string }[]>>({});
  const [customCast, setCustomCast] = useState<CustomCastItem[]>([]);
  const [castRoles, setCastRoles] = useState<{ name: string; role: string }[]>([]);
  const [draftingThree, setDraftingThree] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [filmingSeriesId, setFilmingSeriesId] = useState<string | null>(null);
  const [showManualEditor, setShowManualEditor] = useState(false);
  const [isSafeForWork, setIsSafeForWork] = useState(false);

  const handleChapterCountChange = (newCount: number) => {
    setChapterCount(newCount);
    setManualScenes((curr) => {
      const next = [...curr];
      while (next.length < newCount) next.push("");
      return next.slice(0, newCount);
    });
    setManualLines((curr) => {
      const next = [...curr];
      while (next.length < newCount) next.push("");
      return next.slice(0, newCount);
    });
    setManualSpeakers((curr) => {
      const next = [...curr];
      while (next.length < newCount) next.push("");
      return next.slice(0, newCount);
    });
  };

  const addSubShot = (chapterIndex: number) => {
    setChapterSubShots((prev) => {
      const current = prev[chapterIndex] || [];
      return {
        ...prev,
        [chapterIndex]: [
          ...current,
          {
            id: `shot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            visual: "",
            dialogue: "",
            speaker: manualSpeakers[chapterIndex] || primaryName,
          },
        ],
      };
    });
  };

  const updateSubShot = (chapterIndex: number, shotIndex: number, field: "visual" | "dialogue" | "speaker", value: string) => {
    setChapterSubShots((prev) => {
      const current = [...(prev[chapterIndex] || [])];
      if (!current[shotIndex]) return prev;
      current[shotIndex] = { ...current[shotIndex], [field]: value };
      return { ...prev, [chapterIndex]: current };
    });
  };

  const removeSubShot = (chapterIndex: number, shotIndex: number) => {
    setChapterSubShots((prev) => {
      const current = [...(prev[chapterIndex] || [])];
      current.splice(shotIndex, 1);
      return { ...prev, [chapterIndex]: current };
    });
  };

  const updateChapterField = (index: number, field: string, value: string) => {
    setNovel((prev: any) => {
      if (!prev) return prev;
      const chapters = [...(prev.chapters || [])];
      chapters[index] = { ...chapters[index], [field]: value };
      return { ...prev, chapters };
    });
  };

  const addCustomCastMember = (role: CastSlotRole = "secondary", initialName = "", initialFile: File | null = null) => {
    const newId = `cast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setCustomCast((prev) => [
      ...prev,
      {
        id: newId,
        name: initialName,
        role,
        file: initialFile,
        description: "",
      },
    ]);
    toast({
      title: "Nuevo rol añadido al elenco",
      description: initialName ? `Se asignó a "${initialName}".` : "Configura el rol (Antagonista, Secundario, etc.) y su foto.",
    });
    setTimeout(() => {
      document.getElementById(`custom-cast-${newId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  const updateCustomCastMember = (id: string, updates: Partial<CustomCastItem>) => {
    setCustomCast((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };

  const removeCustomCastMember = (id: string) => {
    setCustomCast((prev) => prev.filter((item) => item.id !== id));
  };
  const [language, setLanguage] = useState("Spanish");
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatingVideos, setGeneratingVideos] = useState(false);
  const [videoProgress, setVideoProgress] = useState("");
  const [novel, setNovel] = useState<any>(null);
   const [chapterImages, setChapterImages] = useState<Record<number, string>>({});
   const [illustratingChapter, setIllustratingChapter] = useState<number | null>(null);


  const creativityLevels = [
    { value: "conservative", label: t("studio.creativity.conservative") },
    { value: "balanced", label: t("studio.creativity.balanced") },
    { value: "creative", label: t("studio.creativity.creative") },
    { value: "wild", label: t("studio.creativity.wild") },
  ];

  const loadedFromUrl = useRef(false);
  const recoveredJob = useRef<string | null>(null);
  useEffect(() => {
    if (loadedFromUrl.current || !projects?.length) return;
    const id = new URLSearchParams(window.location.search).get("project");
    if (!id) return;
    const project = projects.find((item) => item.id === id);
    if (!project) return;
    loadedFromUrl.current = true;
    handleLoadProject(project);
  }, [projects]);

  // Support Showrunner "Remix" flow from Shorts / Explore
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const remixId = params.get("remix");
    const remixTitle = params.get("title");
    const remixPremise = params.get("premise");
    const remixAdult = params.get("adult");

    if (remixId || remixPremise) {
      if (remixPremise) setDescription(remixPremise);
      if (remixTitle) setManualTitle(`Remix: ${remixTitle}`);
      if (remixAdult === "1") {
        setStudioGenre("adult");
        setIsSafeForWork(false);
      }
      setShowManualEditor(true);
      toast({
        title: "🎬 Modo Remix Activado (Showrunner)",
        description: remixTitle
          ? `Iniciaste un spin-off basado en "${remixTitle}". Ajusta el elenco, la locación o las tomas antes de filmar.`
          : "Cargamos la premisa de la serie seleccionada para crear un nuevo spin-off.",
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      void probeLocalKineva().then((probe) => {
        if (!cancelled) setLocalHealth(probe.status);
      });
    };
    check();
    const timer = window.setInterval(check, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    try {
      const savedEpisodes = JSON.parse(window.sessionStorage.getItem("insomnia.studio.episodeIds") || "[]");
      if (Array.isArray(savedEpisodes) && savedEpisodes.every((id) => typeof id === "string")) setSeriesEpisodeIds(savedEpisodes);
    } catch { /* The saved project can be reopened without a pending video. */ }
    const savedId = window.sessionStorage.getItem("insomnia.studio.localJob");
    if (!savedId) return;
    void fetchLocalJob(savedId).then(setLocalJob).catch(() => {
      window.sessionStorage.removeItem("insomnia.studio.localJob");
    });
  }, []);

  useEffect(() => {
    if (localJob?.id) window.sessionStorage.setItem("insomnia.studio.localJob", localJob.id);
  }, [localJob?.id]);

  useEffect(() => {
    if (!user || generatingVideos || localJob?.state !== "completed" || !seriesEpisodeIds.length || recoveredJob.current === localJob.id) return;
    recoveredJob.current = localJob.id;
    void (async () => {
      const { data: episodes, error } = await supabase.from("shorts_episodes")
        .select("id,series_id,status,video_url").in("id", seriesEpisodeIds);
      if (error || !episodes || episodes.length !== seriesEpisodeIds.length ||
          new Set(episodes.map((episode) => episode.series_id)).size !== 1 ||
          localJob.total !== seriesEpisodeIds.length) return;
      const { data: owner } = await supabase.from("shorts_series").select("id")
        .eq("id", episodes[0].series_id).eq("created_by", user.id).eq("is_published", false).maybeSingle();
      if (!owner) return;
      const attached = new Set<number>(episodes.filter((episode) => episode.status === "ready" && episode.video_url)
        .map((episode) => seriesEpisodeIds.indexOf(episode.id) + 1));
      await attachFinishedVideos(localJob, seriesEpisodeIds, attached, {
        fetchVideo: async (url) => {
          const response = await fetch(url, loopbackInit());
          if (!response.ok) throw new Error("No se pudo recuperar el MP4 local.");
          return response.blob();
        }, upload: storeChapterVideo, markReady: markChapterReady,
      });
      setProductionRefresh((value) => value + 1);
    })().catch((error) => {
      recoveredJob.current = null;
      toast({ title: "No se pudieron recuperar los MP4 locales", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    });
  }, [user?.id, generatingVideos, localJob?.id, localJob?.state, seriesEpisodeIds.join(",")]);

  useEffect(() => {
    if (!localJob || ["completed", "failed"].includes(localJob.state)) return;
    const timer = window.setInterval(() => {
      void fetchLocalJob(localJob.id).then(setLocalJob).catch(() => {
        setVideoProgress("Se perdió la conexión con Kineva en esta PC.");
      });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [localJob?.id, localJob?.state]);

  const localStatusText = localHealth === "ready"
    ? "Kineva listo en esta PC."
    : localHealth === "missing-comfy"
      ? "Falta ComfyUI (127.0.0.1:8188). Enciéndelo en esta PC."
      : localHealth === "missing-template"
        ? "Falta la plantilla de Kineva en esta PC."
        : "Al generar el video, Chrome pregunta si puede usar Kineva en esta PC. Pulsa Permitir. El worker sigue en 127.0.0.1:8787.";

  const downloadLocalChapter = async (url: string, episode: number) => {
    try {
      const response = await fetch(localVideoSrc(url), loopbackInit());
      if (!response.ok) throw new Error("El video no está disponible en esta PC.");
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `kineva-capitulo-${episode}.mp4`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    } catch (error) {
      toast({ title: "No se pudo descargar el capítulo", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  const storeChapterVideo = async (episodeId: string, blob: Blob) => {
    const path = "episodes/" + episodeId + "/local/" + crypto.randomUUID() + ".mp4";
    const { error } = await supabase.storage.from("shorts-media").upload(path, blob, {
      contentType: "video/mp4", upsert: false,
    });
    if (error) throw new Error(error.message);
    return path;
  };

  const markChapterReady = async (episodeId: string, path: string) => {
    const { error } = await supabase.from("shorts_episodes").update({
      status: "ready", video_url: path, error_message: null,
    }).eq("id", episodeId);
    if (error) throw new Error(error.message);
    setProductionRefresh((value) => value + 1);
  };

  const filmChapters = async (chapters: string[], episodeIds: string[], pendingProbe?: Promise<LocalProbe> | LocalProbe, dialogues: string[] = [], storyPlan?: any, existingJob?: LocalJob) => {
    const probe = await (pendingProbe ?? probeLocalKineva());
    setLocalHealth(probe.status);
    if (probe.status !== "ready") {
      throw new Error(probe.status === "missing-comfy"
        ? "La novela ya está guardada. Falta ComfyUI en esta PC (127.0.0.1:8188) para filmar los capítulos."
        : probe.status === "missing-template"
          ? "La novela ya está guardada. Falta la plantilla de Kineva en esta PC."
          : "La novela ya está guardada. Enciende Kineva en esta PC con start-local-studio.ps1 para filmar los capítulos.");
    }
    setGeneratingVideos(true);
    setVideoProgress("ComfyUI está filmando los capítulos en esta PC…");
    const image = !existingJob && referenceImage ? await encodeLocalImage(referenceImage) : null;
    const storyCharacters = Array.isArray(storyPlan?.characters) ? storyPlan.characters : [];
    const first = storyCharacters[0] || {};
    const second = storyCharacters[1] || {};
    const setting = storyPlan?.setting || {};
    const customSupporting = await Promise.all(
      customCast
        .filter((actor) => actor.name.trim() && actor.file)
        .map(async (actor) => ({ name: actor.name.trim(), image: await encodeLocalImage(actor.file!) }))
    );
    const supporting = [
      ...(await Promise.all(supportingCast.filter((actor) => actor.name !== primaryName && actor.name !== secondaryName).map(async (actor) => ({ name: actor.name, image: await encodeLocalImage(actor.file) })))),
      ...customSupporting,
    ];
    const cast = {
      primary_name: primaryName.trim() || String(first.name || "").slice(0, 80),
      primary_description: image ? "" : String(first.visual_prompt || [first.appearance, first.wardrobe].filter(Boolean).join(". ")).slice(0, 500),
      secondary_name: secondaryName.trim() || (secondaryImage ? "" : String(second.name || "").slice(0, 80)),
      secondary_description: secondaryImage ? "" : String(second.visual_prompt || [second.appearance, second.wardrobe].filter(Boolean).join(". ")).slice(0, 500),
      secondary_image: secondaryImage ? await encodeLocalImage(secondaryImage) : null,
      supporting,
      location_name: locationName.trim() || String(setting.place || "").slice(0, 80),
      location_description: locationDescription.trim() || String([setting.place, setting.time, setting.visual_style].filter(Boolean).join(". ")).slice(0, 500),
      location_image: locationImage ? await encodeLocalImage(locationImage) : null,
    };
    const shotPlans = (storyPlan?.chapters || []).map((chapter: any, index: number) => {
      const plans = Array.isArray(chapter.shots) ? chapter.shots.map((shot: any) => ({
        visual: String(shot.visual || "").trim(), dialogue: String(shot.dialogue || "").trim(),
        speaker: String(shot.speaker || manualSpeakers[index] || "").trim(),
      })).filter((shot: { visual: string }) => shot.visual.length >= 3) : [];
      return plans.length ? plans : [{ visual: chapters[index], dialogue: dialogues[index] || "" }];
    });
    if (episodeIds.length) window.sessionStorage.setItem("insomnia.studio.episodeIds", JSON.stringify(episodeIds));
    const result = await publishLocalChapters({
      chapters,
      shotPlans: shotPlans.length === chapters.length ? shotPlans : undefined,
      existingJob,
      dialogues,
      episodeIds,
      image,
      cast,
      onJob: (job) => {
        setLocalJob(job);
        if (job.state === "rendering") setVideoProgress("Filmando capítulo " + job.current + " de " + job.total + "…");
      },
      createJob: createLocalJob,
      fetchJob: fetchLocalJob,
      fetchVideo: async (url) => {
        const response = await fetch(url, loopbackInit());
        if (!response.ok) throw new Error("No se pudo leer el video que creó ComfyUI.");
        return response.blob();
      },
      upload: storeChapterVideo,
      markReady: markChapterReady,
    });
    if (result.state === "completed") {
      toast({ title: "Capítulos generados", description: "Los videos permanecen privados en Producción hasta que los apruebes para Shorts." });
    }
  };

  const handleLocalReview = async (approve: boolean) => {
    if (!localJob) return;
    const current = localJob;
    try {
      await reviewLocalJob(current.id, approve);
      if (!approve) {
        setLocalJob({ ...current, state: "failed", error: "Toma rechazada. Ajusta las referencias o la escena para comenzar otra." });
        return;
      }
      setLocalJob({ ...current, state: "rendering" });
      if (!seriesEpisodeIds.length) return;
      setGeneratingVideos(true);
      await filmChapters([], seriesEpisodeIds, undefined, [], novel, { ...current, state: "rendering" });
    } catch (e) {
      toast({ title: "No se pudo continuar el video", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setGeneratingVideos(false);
    }
  };

  const draftThreeChapters = async (): Promise<boolean> => {
    const idea = description.trim();
    if (idea.length < 10) {
      toast({ title: "Escribe una idea breve para que la IA prepare los capítulos.", variant: "destructive" });
      return false;
    }
    setDraftingThree(true);
    try {
      let draft: any = null;
      // 1. Try local Kineva / Magnum model (uncensored for adult & drama, instant)
      try {
        const localRes = await fetch(`${LOCAL_KINEVA_URL}/draft`, loopbackInit({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: idea, language, chapters: chapterCount }),
        }));
        if (localRes.ok) {
          const json = await localRes.json();
          if (Array.isArray(json?.draft?.chapters) && json.draft.chapters.length > 0) draft = json.draft;
        }
      } catch {
        // Fallback to cloud API
      }

      // 2. If not from local, try cloud API
      if (!draft) {
        const allCast = [
          primaryName,
          secondaryName,
          ...supportingCast.map((actor) => actor.name),
          ...customCast.filter((c) => c.role !== "location" && c.role !== "key_object").map((c) => c.name),
        ].filter(Boolean);

        const keyProps = customCast.filter((c) => c.role === "key_object").map((c) => c.name).filter(Boolean);

        const { data, error } = await invokeFunctionWithRetry<{ draft?: { title: string; cast_roles?: { name: string; role: string }[]; chapters: { visual: string; dialogue: string; speaker?: string }[] } }>("generate-studio-draft", {
          description: idea,
          language,
          chapters: chapterCount,
          chapterCount,
          cast_names: allCast,
          location_name: locationName,
          location_description: locationDescription,
          props: keyProps,
        });
        if (error || !data?.draft?.chapters || data.draft.chapters.length === 0) {
          throw new Error(error?.message || "La IA no entregó los capítulos.");
        }
        draft = data.draft;
      }

      setManualTitle(String(draft.title || manualTitle || "Mi miniserie").slice(0, 120));
      setCastRoles(Array.isArray(draft.cast_roles) ? draft.cast_roles.filter((entry: any) => entry?.name && entry?.role).slice(0, 20) : []);
      const returnedChapters = draft.chapters || [];
      if (returnedChapters.length !== chapterCount && returnedChapters.length > 0) {
        setChapterCount(returnedChapters.length);
      }
      setManualScenes(returnedChapters.map((chapter: any) => String(chapter.visual || "").slice(0, 1200)));
      setManualLines(returnedChapters.map((chapter: any) => String(chapter.dialogue || "").slice(0, 400)));
      setManualSpeakers(returnedChapters.map((chapter: any) => String(chapter.speaker || "").slice(0, 80)));
      setShowManualEditor(true);
      toast({ title: "¡Guion preparado con IA!", description: `Los ${returnedChapters.length} capítulos fueron generados a partir de tu idea. Puedes revisarlos o filmarlos.` });
      return true;
    } catch (error) {
      toast({ title: "No pude preparar el guion", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
      return false;
    } finally {
      setDraftingThree(false);
    }
  };

  const handleSaveManualDraftOnly = async () => {
    if (!user) {
      toast({ title: "Inicia sesión para guardar la serie.", variant: "destructive" });
      return;
    }
    const title = manualTitle.trim() || description.trim().slice(0, 40) || novel?.title || "Miniserie Insomnia";
    const scenes = manualScenes.slice(0, chapterCount).map((text) => text.trim());
    const lines = manualLines.slice(0, chapterCount).map((text) => text.trim());
    setSavingDraft(true);
    try {
      const spokenShots = lines.map((line) => splitKinevaDialogue(line));
      const chapters = scenes.map((visual, index) => {
        const extraSubs = (chapterSubShots[index] || []).filter((s) => s.visual.trim().length >= 3);
        const mainShot = {
          visual,
          dialogue: spokenShots[index][0] || "",
          speaker: manualSpeakers[index] || primaryName,
        };
        const allShots = [
          mainShot,
          ...extraSubs.map((sub) => ({
            visual: sub.visual.trim(),
            dialogue: sub.dialogue.trim(),
            speaker: sub.speaker.trim() || manualSpeakers[index] || primaryName,
          })),
        ];
        return {
          number: index + 1,
          title: "Capítulo " + (index + 1),
          content: visual + (lines[index] ? "\n" + lines[index] : ""),
          video_prompt: visual,
          spoken_line: spokenShots[index][0],
          shots: allShots,
        };
      });
      const draft = { title, logline: description.trim() || scenes[0] || title, chapters };
      let referencePath: string | null = null;
      if (referenceImage) {
        try {
          referencePath = await uploadKinevaReference(user.id, title, referenceImage);
        } catch {
          // Ignored
        }
      }
      const saved = await saveNovelSeries({
        userId: user.id,
        novel: draft,
        description: draft.logline,
        isAdult: !isSafeForWork,
        referencePath,
        speakers: manualSpeakers.slice(0, chapterCount),
        lines,
        existingSeriesId: savedSeriesId || undefined,
      });
      setNovel(draft);
      setSeriesEpisodeIds(saved.episodeIds);
      setSavedSeriesId(saved.seriesId);
      setProductionRefresh((v) => v + 1);
      toast({
        title: "Guion guardado en Producción",
        description: `Los cambios de "${title}" quedaron guardados.`,
      });
    } catch (error) {
      toast({
        title: "No se pudo guardar el guion",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSavingDraft(false);
    }
  };

  const handleFilmSeriesDirectly = async (series: ProductionSeries) => {
    if (!user) {
      toast({ title: t("studio.toast.loginToCreate"), variant: "destructive" });
      return;
    }
    const loopbackProbe = probeLocalKineva();
    const probe = await loopbackProbe;
    if (probe.status !== "ready") {
      toast({
        title: "Motor de video local no detectado",
        description: "Para filmar y renderizar los videos MP4 en tu PC, inicia ComfyUI y Kineva.",
      });
      return;
    }
    setFilmingSeriesId(series.id);
    setGeneratingVideos(true);
    setVideoProgress(`Filmando capítulos de "${series.title}" con ComfyUI...`);
    toast({
      title: "Iniciando filmación con ComfyUI",
      description: `ComfyUI está procesando los capítulos de "${series.title}" en tu GPU.`,
    });
    try {
      const episodes = [...(series.episodes || [])].sort((a, b) => a.episode_number - b.episode_number);
      const isHorrorOrSuspense = /horror|terror|misterio|selva|silb[oó]n|noche|sombra|muerte|miedo|fantasmas|bosque/i.test(
        series.title + " " + (series.premise || "")
      );
      const atmosphere = isHorrorOrSuspense
        ? "Cinematic dark horror atmosphere, October autumn mist, ominous forest shadows, cold moonlight, intense suspense, tense expressions, 8k photorealistic"
        : "Cinematic dramatic lighting, detailed textures, expressive faces, 8k photorealistic";

      const chapterTexts = episodes.map((ep) => {
        const base = ep.video_prompt || (ep.script ? ep.script.slice(0, 250) : series.title);
        return `${base}. ${atmosphere}`;
      });
      const episodeIds = episodes.map((ep) => ep.id);
      const dialogues = episodes.map((ep, idx) => series.kineva_bible?.lines?.[idx] || extractDialogueFromText(ep.script));
      const storyPlan = {
        title: series.title,
        logline: series.premise || series.title,
        chapters: episodes.map((ep) => ({
          number: ep.episode_number,
          title: ep.title,
          content: ep.script,
          video_prompt: ep.video_prompt || ep.script,
        })),
      };

      setSavedSeriesId(series.id);
      setSeriesEpisodeIds(episodeIds);
      await filmChapters(chapterTexts, episodeIds, probe, dialogues, storyPlan);
      toast({ title: "Filmación completada", description: `Los capítulos de "${series.title}" fueron generados con éxito.` });
      setProductionRefresh((v) => v + 1);
    } catch (e) {
      toast({
        title: "No se pudieron filmar los videos",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setFilmingSeriesId(null);
      setGeneratingVideos(false);
      setVideoProgress("");
    }
  };

  const handleManualSeries = async () => {
    if (!user) {
      toast({ title: "Inicia sesión para guardar la serie.", variant: "destructive" });
      return;
    }
    const title = manualTitle.trim() || description.trim().slice(0, 40) || "Miniserie Insomnia";
    const scenes = manualScenes.slice(0, chapterCount).map((text) => text.trim());
    const lines = manualLines.slice(0, chapterCount).map((text) => text.trim());
    const missingScene = scenes.findIndex((text) => text.length < 5);
    if (missingScene !== -1) {
      if (description.trim().length >= 10) {
        toast({ title: "Generando guion automático con IA...", description: `Completando los ${chapterCount} capítulos a partir de tu idea antes de filmar.` });
        const ok = await draftThreeChapters();
        if (ok) return;
      }
      toast({ title: `Describe qué ocurre en el capítulo ${missingScene + 1} o pulsa 'Generar guion con IA'.`, variant: "destructive" });
      return;
    }
    const longLine = lines.findIndex((text) => splitKinevaDialogue(text).length > 3);
    if (longLine !== -1) {
      toast({ title: `El diálogo del capítulo ${longLine + 1} supera tres tomas. Acórtalo o divídelo en otra escena.`, variant: "destructive" });
      return;
    }
    if (!referenceImage) {
      toast({ title: "Sin foto de referencia", description: "ComfyUI creará el aspecto visual del protagonista según el guion." });
    }
    if (localJob && !["completed", "failed"].includes(localJob.state)) {
      toast({ title: "Termina o rechaza la serie que está en curso antes de comenzar otra.", variant: "destructive" });
      return;
    }
    setGeneratingVideos(true);
    const spokenShots = lines.map((line) => splitKinevaDialogue(line));
    const chapters = scenes.map((visual, index) => {
      const extraSubs = (chapterSubShots[index] || []).filter((s) => s.visual.trim().length >= 3);
      const mainShot = {
        visual,
        dialogue: spokenShots[index][0] || "",
        speaker: manualSpeakers[index] || primaryName,
      };
      const allShots = [
        mainShot,
        ...extraSubs.map((sub) => ({
          visual: sub.visual.trim(),
          dialogue: sub.dialogue.trim(),
          speaker: sub.speaker.trim() || manualSpeakers[index] || primaryName,
        })),
      ];
      return {
        number: index + 1,
        title: "Capítulo " + (index + 1),
        content: visual + (lines[index] ? "\n" + lines[index] : ""),
        video_prompt: visual,
        spoken_line: spokenShots[index][0],
        shots: allShots,
      };
    });
    const draft = { title, logline: description.trim() || scenes[0], chapters };
    try {
      const probe = await probeLocalKineva();
      if (probe.status !== "ready") {
        throw new Error(probe.status === "missing-comfy"
          ? "ComfyUI no está conectado en el puerto 8188."
          : probe.status === "missing-template"
            ? "Falta la plantilla de Kineva en esta PC."
            : "El motor Kineva no está conectado en el puerto 8787.");
      }
      let referencePath: string | null = null;
      try {
        referencePath = await uploadKinevaReference(user.id, title, referenceImage);
      } catch {
        // The local photo remains usable even when the optional cloud cover upload fails.
      }
      const saved = await saveNovelSeries({
        userId: user.id,
        novel: draft,
        description: draft.logline,
        isAdult: !isSafeForWork,
        referencePath,
        speakers: manualSpeakers.slice(0, chapterCount),
        lines,
        existingSeriesId: savedSeriesId || undefined,
      });
      setNovel(draft);
      setSeriesEpisodeIds(saved.episodeIds);
      setSavedSeriesId(saved.seriesId);
      setLocalJob(null);
      toast({ title: "Serie guardada en Producción", description: "Los capítulos se filmarán y quedarán privados hasta tu aprobación final." });
      await filmChapters(scenes, saved.episodeIds, probe, spokenShots.map((shots) => shots[0]), draft);
    } catch (error) {
      toast({
        title: "La serie no pudo completar sus videos",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setGeneratingVideos(false);
    }
  };

  const regenerateChapter = async (index: number) => {
    if (!seriesEpisodeIds[index]) return;
    const visual = manualScenes[index]?.trim();
    if (!visual || visual.length < 5 || !referenceImage) {
      toast({ title: "Escribe la escena y conserva la foto del protagonista.", variant: "destructive" });
      return;
    }
    const spoken = splitKinevaDialogue(manualLines[index] || "");
    if (spoken.length > 3) {
      toast({ title: "Divide ese diálogo en hasta tres tomas.", variant: "destructive" });
      return;
    }
    const extraSubs = (chapterSubShots[index] || []).filter((s) => s.visual.trim().length >= 3);
    const allShots = [
      { visual, dialogue: spoken[0] || "", speaker: manualSpeakers[index] || primaryName },
      ...extraSubs.map((sub) => ({
        visual: sub.visual.trim(),
        dialogue: sub.dialogue.trim(),
        speaker: sub.speaker.trim() || manualSpeakers[index] || primaryName,
      })),
    ];
    try {
      await filmChapters([visual], [seriesEpisodeIds[index]], undefined, [spoken[0] || ""], {
        chapters: [{ shots: allShots }],
      });
      const { error: episodeError } = await supabase.from("shorts_episodes")
        .update({ video_prompt: visual }).eq("id", seriesEpisodeIds[index]);
      if (episodeError) throw new Error(episodeError.message);
      if (savedSeriesId) {
        const { error } = await supabase.from("shorts_series").update({ kineva_bible: { language: "Spanish", speakers: manualSpeakers, lines: manualLines } } as any).eq("id", savedSeriesId);
        if (error) throw new Error(error.message);
      }
      setProductionRefresh((value) => value + 1);
      toast({ title: `Capítulo ${index + 1} actualizado`, description: "El nuevo MP4 reemplazó al anterior en esta serie." });
    } catch (error) {
      toast({ title: "No se pudo regenerar el capítulo", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally { setGeneratingVideos(false); }
  };

  const handleGenerateProject = async () => {
    if (!user) {
      toast({ title: t("studio.toast.loginToCreate"), variant: "destructive" });
      return;
    }
    const hasManualScenes = manualScenes.some((text) => text.trim().length >= 5);
    if (hasManualScenes) {
      return handleManualSeries();
    }
    if (description.trim().length < 10) {
      toast({ title: "Describe tu idea con más detalle", variant: "destructive" });
      return;
    }

    const loopbackProbe = probeLocalKineva();
    setGenerating(true);
    setNovel(null);
    let generated: any = null;
    let episodeIds: string[] = [];
    try {
      const { data, error } = await invokeFunctionWithRetry<any>("generate-novel", {
          description,
          chapterCount,
          language,
          creativity,
          isSafeForWork,
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);

      generated = data.novel;
      setNovel(generated);

      const content = (generated.chapters ?? [])
        .map((c: any) => `## ${c.number}. ${c.title}\n\n${c.content}`)
        .join("\n\n");
      const bible = JSON.stringify(
        { characters: generated.characters, setting: generated.setting },
        null,
        2,
      );

      const payload = {
        title: generated.title || "Proyecto sin título",
        description,
        content,
        outline: `${generated.outline ?? ""}\n\n<!-- BIBLE\n${bible}\n-->`,
        chapter_count: chapterCount,
        language,
        model,
        creativity,
        is_safe_for_work: isSafeForWork,
      };

      if (currentProjectId) {
        await updateProject.mutateAsync({ id: currentProjectId, ...payload });
      } else {
        const created = await createProject.mutateAsync(payload);
        setCurrentProjectId(created.id);
      }
      let referencePath: string | null = null;
      if (referenceImage) {
        try {
          referencePath = await uploadKinevaReference(user.id, description, referenceImage);
        } catch {
          referencePath = null;
        }
      }
      const savedSeries = await saveNovelSeries({
        userId: user.id,
        novel: generated,
        description,
        isAdult: !isSafeForWork,
        referencePath,
      });
      episodeIds = savedSeries.episodeIds;
      setSeriesEpisodeIds(savedSeries.episodeIds);
      setSavedSeriesId(savedSeries.seriesId);
      setProductionRefresh((v) => v + 1);
      toast({
        title: `Novela "${savedSeries.title}" guardada con éxito`,
        description: "El guion y los capítulos están listos en la sección Producción de esta pantalla.",
      });
      setTimeout(() => {
        document.getElementById("studio-production")?.scrollIntoView({ behavior: "smooth" });
      }, 300);
    } catch (e) {
      toast({
        title: "La novela no se generó",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
      return;
    } finally {
      setGenerating(false);
    }
    const chapterScenes = (generated.chapters ?? [])
      .map((chapter: { video_prompt?: string; summary?: string; content?: string; spoken_line?: string }) => ({
        visual: String(chapter.video_prompt || chapter.summary || chapter.content || "").trim(),
        dialogue: String(chapter.spoken_line || "").trim(),
      }))
      .filter((scene: { visual: string }) => scene.visual.length >= 5);
    const chapterTexts = chapterScenes.map((scene: { visual: string }) => scene.visual);
    const probe = await loopbackProbe;
    if (probe.status !== "ready") {
      toast({
        title: "Novela guardada en Producción",
        description: "El guion y los capítulos están guardados con éxito. Para renderizar los videos MP4 en tu PC con aceleración gráfica, inicia Kineva Studio (start-local-studio.ps1).",
      });
      return;
    }
    try {
      await filmChapters(chapterTexts, episodeIds, probe, chapterScenes.map((scene: { dialogue: string }) => scene.dialogue), generated);
    } catch (e) {
      toast({
        title: "Error al renderizar el video",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setGeneratingVideos(false);
      setVideoProgress("");
    }
  };

  const handleSaveNovelChanges = async () => {
    if (!user || !novel) return;
    setSavingDraft(true);
    try {
      const saved = await saveNovelSeries({
        userId: user.id,
        novel,
        description: description.trim() || novel.logline || novel.title,
        isAdult: !isSafeForWork,
        existingSeriesId: savedSeriesId || undefined,
      });
      setSavedSeriesId(saved.seriesId);
      setSeriesEpisodeIds(saved.episodeIds);
      setProductionRefresh((v) => v + 1);
      toast({
        title: "Guion guardado",
        description: `Los cambios de "${novel.title}" quedaron guardados en Producción.`,
      });
    } catch (e) {
      toast({
        title: "No se pudo guardar el guion",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSavingDraft(false);
    }
  };

  const handleGenerateVideos = async () => {
    if (!user) {
      toast({ title: t("studio.toast.loginToCreate"), variant: "destructive" });
      return;
    }
    const existingChapters = (novel?.chapters ?? []).filter((ch: any) =>
      Boolean(ch.video_prompt || ch.summary || ch.content)
    );
    const hasExistingScenes = existingChapters.length > 0 || manualScenes.some((s) => s.trim().length >= 3);

    if (!hasExistingScenes && !novel?.chapters?.length && description.trim().length < 5) {
      toast({ title: "Escribe la idea o agrega capítulos al guion.", variant: "destructive" });
      return;
    }

    const loopbackProbe = probeLocalKineva();
    const probe = await loopbackProbe;
    if (probe.status !== "ready") {
      toast({
        title: "Motor de video local no detectado",
        description: "Para filmar y renderizar los videos MP4 en tu PC con tu tarjeta gráfica, ejecuta 'start-local-studio.ps1' para iniciar ComfyUI y Kineva.",
      });
      return;
    }
    try {
      let episodeIds = seriesEpisodeIds;
      const isHorrorOrSuspense = /horror|terror|misterio|selva|silb[oó]n|noche|sombra|muerte|miedo|fantasmas|bosque/i.test(
        (novel?.title || "") + " " + (description || "") + " " + (manualTitle || "")
      );
      const atmosphere = isHorrorOrSuspense
        ? "Cinematic dark horror atmosphere, October autumn mist, ominous forest shadows, cold moonlight, intense suspense, tense expressions, 8k photorealistic"
        : "Cinematic lighting, detailed textures, expressive faces, 8k photorealistic";

      const scenes = (novel?.chapters ?? [])
        .map((chapter: { video_prompt?: string; summary?: string; content?: string; spoken_line?: string }) => {
          const rawDialogue = String(chapter.spoken_line || "").trim() || extractDialogueFromText(String(chapter.content || ""));
          const basePrompt = String(chapter.video_prompt || chapter.summary || "").trim();
          const narrative = String(chapter.content || "").slice(0, 250);
          const visual = [basePrompt || narrative, atmosphere].filter(Boolean).join(". ").trim();
          return {
            visual,
            dialogue: rawDialogue,
          };
        }).filter((scene: { visual: string }) => scene.visual.length >= 5);

      const chapterTexts = scenes.map((scene: { visual: string }) => scene.visual);
      if (!episodeIds.length && novel) {
        const savedSeries = await saveNovelSeries({
          userId: user.id,
          novel,
          description: description.trim() || novel?.logline || novel?.title || "Miniserie",
          isAdult: !isSafeForWork,
          existingSeriesId: savedSeriesId || undefined,
        });
        episodeIds = savedSeries.episodeIds;
        setSeriesEpisodeIds(episodeIds);
        setSavedSeriesId(savedSeries.seriesId);
      }
      await filmChapters(
        chapterTexts.length ? chapterTexts : [String(description || novel?.logline || manualTitle || "Escena")],
        episodeIds,
        probe,
        scenes.map((scene: { dialogue: string }) => scene.dialogue),
        novel
      );
    } catch (e) {
      toast({
        title: "No se pudieron generar los videos",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setGeneratingVideos(false);
      setVideoProgress("");
    }
  };

   const handleWriteOutline = () => {
    toast({ title: t("studio.toast.outline"), description: t("studio.toast.outlineDesc") });
   };

   const handleBlankNovel = () => {
     setDescription("");
     setCurrentProjectId(null);
    toast({ title: t("studio.toast.blank") });
   };

   const illustrateChapter = async (chapter: any, index: number) => {
     if (!novel || illustratingChapter !== null) return;
     setIllustratingChapter(index);
     try {
       const imageUrl = await generateSceneImage({
         source: "novel",
         sceneKey: String(chapter.number || index + 1),
         focusText: String(chapter.content || chapter.summary || chapter.video_prompt || "").slice(0, 1800),
         sceneText: (novel.chapters || []).slice(Math.max(0, index - 2), index + 1)
           .map((item: any) => String(item.summary || item.content || "").slice(0, 600)).join("\n"),
         storyTitle: novel.title,
         storyDescription: novel.logline || description,
         characterRole: JSON.stringify(novel.characters || []).slice(0, 1200),
         playerRole: "",
         language,
       });
       setChapterImages((previous) => ({ ...previous, [index]: imageUrl }));
     } catch (failure) {
       toast({ title: "No se pudo ilustrar el capÃ­tulo", description: failure instanceof Error ? failure.message : undefined, variant: "destructive" });
     } finally {
       setIllustratingChapter(null);
     }
   };

   const handleSaveProject = async () => {
     if (!user) {
      toast({ title: t("studio.toast.loginToSave"), variant: "destructive" });
       return;
     }

     try {
       if (currentProjectId) {
         await updateProject.mutateAsync({
           id: currentProjectId,
           description,
           chapter_count: chapterCount,
           language,
           model,
           creativity,
           is_safe_for_work: isSafeForWork,
         });
          toast({ title: t("studio.toast.saved") });
       } else {
         const newProject = await createProject.mutateAsync({
           title: "New Project",
           description,
           chapter_count: chapterCount,
           language,
           model,
           creativity,
           is_safe_for_work: isSafeForWork,
         });
         setCurrentProjectId(newProject.id);
          toast({ title: t("studio.toast.created") });
       }
     } catch (error) {
        toast({ title: t("studio.toast.saveError"), variant: "destructive" });
     }
   };

   const handleLoadProject = (project: any) => {
     setCurrentProjectId(project.id);
     setDescription(project.description || "");
     setChapterCount(project.chapter_count);
     setLanguage(project.language);
     setModel(project.model.toLowerCase().replace(" ", "-"));
     setCreativity(project.creativity.toLowerCase());
     setIsSafeForWork(project.is_safe_for_work);
     const restored = novelFromProject(project);
     setNovel(restored.chapters.length ? restored : null);
     toast({
       title: restored.chapters.length ? t("studio.toast.loaded") : "Este proyecto no guardó los capítulos",
       description: restored.chapters.length
         ? `${restored.chapters.length} capítulos recuperados.`
         : "La idea sigue aquí. Vuelve a generar el proyecto para escribir los capítulos otra vez.",
       ...(restored.chapters.length ? {} : { variant: "destructive" as const }),
     });
   };

   const handleDeleteProjects = async () => {
     if (projects) {
       await Promise.all(projects.map((project) => deleteProject.mutateAsync(project.id)));
       toast({ title: t("studio.toast.allDeleted") });
       setCurrentProjectId(null);
       setDescription("");
     }
   };

   const handleReset = () => {
     setDescription("");
     setModel("apprentice-6");
     setCreativity("balanced");
     setChapterCount(7);
     setIsSafeForWork(false);
     setStudioGenre("adult");
     setLanguage("English");
     setCurrentProjectId(null);
    toast({ title: t("studio.toast.reset") });
   };

   const allAvailableSpeakers = [
     primaryName,
     secondaryName,
     ...supportingCast.map((actor) => actor.name),
     ...customCast.filter((c) => c.role !== "location" && c.role !== "key_object").map((c) => c.name),
   ].filter(Boolean);

   if (!user) {
     return (
       <MainLayout>
         <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-3xl font-display mb-4">{t("studio.title")}</h1>
          <p role="status" className={`mb-4 text-sm ${localHealth === "ready" ? "text-emerald-600" : "text-amber-600"}`}>{localStatusText}</p>
          <p className="text-muted-foreground mb-6">{t("studio.loginRequired")}</p>
           <Link to="/login">
            <Button>{t("nav.login")}</Button>
           </Link>
         </div>
       </MainLayout>
     );
   }

   return (
     <MainLayout>
       <div className="container mx-auto px-4 py-8 max-w-6xl">
        <h1 className="text-3xl font-display text-center mb-2">{t("studio.title")}</h1>
        <p role="status" className={`mb-6 text-center text-sm ${localHealth === "ready" ? "text-emerald-600" : "text-amber-600"}`}>{localStatusText}</p>
        <p className="mb-6 text-center text-sm text-muted-foreground">Aquí se escribe la novela. Las portadas quedan en Shorts.</p>

         <StudioProduction userId={user.id} refreshKey={`${savedSeriesId}:${localJob?.state}:${localJob?.videos?.length}:${productionRefresh}`}
           isFilming={generatingVideos}
           filmingSeriesId={filmingSeriesId}
           onFilm={handleFilmSeriesDirectly}
           onEdit={(series: ProductionSeries, reference) => {
             setSavedSeriesId(series.id);
             const epIds = series.episodes.map((episode) => episode.id);
             setSeriesEpisodeIds(epIds);
             setManualTitle(series.title);
             const seriesPremise = series.premise || series.title;
             setDescription(seriesPremise);
             setChapterCount(series.episodes.length || 3);
             setManualScenes(series.episodes.map((episode) => episode.video_prompt || episode.script));
             setManualLines(series.episodes.map((episode, index) => series.kineva_bible?.lines?.[index] ||
               (episode.script.length < 500 ? episode.script.replace(episode.video_prompt || "", "").trim() : "")));
             setManualSpeakers(series.episodes.map((_, index) => series.kineva_bible?.speakers?.[index] || ""));
             setReferenceImage(reference);
             setNovel({
               title: series.title,
               logline: seriesPremise,
               chapters: series.episodes.map((episode) => ({
                 number: episode.episode_number,
                 title: episode.title,
                 content: episode.script,
                 video_prompt: episode.video_prompt || episode.script,
                 spoken_line: series.kineva_bible?.lines?.[episode.episode_number - 1] || extractDialogueFromText(episode.script),
               })),
             });
             setLocalJob(null);
             setShowManualEditor(false);
             window.sessionStorage.setItem("insomnia.studio.episodeIds", JSON.stringify(epIds));
             setTimeout(() => {
               document.getElementById("studio-novel-card")?.scrollIntoView({ behavior: "smooth" });
             }, 150);
           }}
           onDelete={(deletedId) => {
             if (savedSeriesId === deletedId) {
               setSavedSeriesId(null);
               setSeriesEpisodeIds([]);
               setNovel(null);
               setManualTitle("");
               setManualScenes(Array(chapterCount).fill(""));
               setManualLines(Array(chapterCount).fill(""));
               setManualSpeakers(Array(chapterCount).fill(""));
               setChapterSubShots({});
             }
           }} />
         <Card className="p-6 mb-6 space-y-2">
           <Label>Motor de video</Label>
           <p className="text-sm font-medium">Kineva · ComfyUI en esta PC</p>
         </Card>
         <Card className="p-6 mb-6">
          <h2 className="text-lg font-medium text-center mb-6">{t("studio.aiSection")}</h2>

           <div className="grid grid-cols-2 gap-6">
             <div className="space-y-2">
              <Label>{t("studio.model")}:</Label>
               <Select value={model} onValueChange={setModel}>
                 <SelectTrigger>
                   <SelectValue />
                 </SelectTrigger>
                 <SelectContent>
                   {models.map((m) => (
                     <SelectItem key={m.value} value={m.value}>
                       {m.label}
                     </SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>

             <div className="space-y-2">
              <Label>{t("studio.creativity")}:</Label>
               <Select value={creativity} onValueChange={setCreativity}>
                 <SelectTrigger>
                   <SelectValue />
                 </SelectTrigger>
                 <SelectContent>
                   {creativityLevels.map((c) => (
                     <SelectItem key={c.value} value={c.value}>
                       {c.label}
                     </SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>
           </div>
         </Card>           <Card className="p-6 mb-6 space-y-5 border-primary/20 bg-card/60 backdrop-blur-sm">
             <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
               <div>
                 <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary uppercase tracking-wider mb-1">
                   <Film className="w-3 h-3" />
                   <span>LTX Elements & Casting Studio</span>
                 </div>
                 <h2 className="text-xl font-bold flex items-center gap-2">
                   Elementos de Producción (Elements)
                 </h2>
                 <p className="text-xs text-muted-foreground">
                   Fija los personajes, las locaciones fijas y los objetos/props clave para garantizar consistencia cinematográfica cuadro a cuadro.
                 </p>
               </div>
               <div className="flex items-center gap-2">
                 <Button
                   type="button"
                   variant="outline"
                   size="sm"
                   onClick={() => addCustomCastMember("secondary")}
                   className="gap-1.5 text-xs h-8"
                 >
                   <UserPlus className="w-3.5 h-3.5" /> + Personaje
                 </Button>
                 <Button
                   type="button"
                   variant="outline"
                   size="sm"
                   onClick={() => addCustomCastMember("location")}
                   className="gap-1.5 text-xs h-8"
                 >
                   <MapPin className="w-3.5 h-3.5" /> + Locación
                 </Button>
                 <Button
                   type="button"
                   variant="outline"
                   size="sm"
                   onClick={() => addCustomCastMember("key_object")}
                   className="gap-1.5 text-xs h-8"
                 >
                   <Box className="w-3.5 h-3.5" /> + Prop Clave
                 </Button>
               </div>
             </div>

             <Tabs defaultValue="cast" className="w-full">
               <TabsList className="grid grid-cols-3 w-full bg-muted/40 p-1 rounded-xl border border-border/60">
                 <TabsTrigger value="cast" className="text-xs font-bold gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                   <Users className="w-3.5 h-3.5" />
                   <span>1. Personajes & Elenco</span>
                   {primaryName ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> : null}
                 </TabsTrigger>
                 <TabsTrigger value="locations" className="text-xs font-bold gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                   <MapPin className="w-3.5 h-3.5" />
                   <span>2. Locaciones & Sets</span>
                   {locationName ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> : null}
                 </TabsTrigger>
                 <TabsTrigger value="props" className="text-xs font-bold gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                   <Box className="w-3.5 h-3.5" />
                   <span>3. Objetos & Props</span>
                   {customCast.some(c => c.role === "key_object") ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> : null}
                 </TabsTrigger>
               </TabsList>

               {/* TAB 1: PERSONAJES */}
               <TabsContent value="cast" className="space-y-4 pt-3">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {/* Protagonista con Upload Yourself */}
                   <div className="space-y-2.5 p-4 rounded-xl border-2 border-primary/40 bg-primary/5 relative">
                     <div className="flex items-center justify-between">
                       <Label htmlFor="kineva-reference" className="text-xs font-bold text-primary flex items-center gap-1.5 uppercase tracking-wide">
                         <Users className="w-3.5 h-3.5" /> Protagonista (Upload Yourself)
                       </Label>
                       <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">Rostro Ancla</span>
                     </div>
                     <p className="text-[11px] text-muted-foreground">
                       Sube tu propia foto o el rostro del actor principal. Wan 2.1 e IP-Adapter fijarán esta identidad en todos los capítulos.
                     </p>
                     <input id="kineva-reference" type="file" accept="image/png,image/jpeg,image/webp"
                       onChange={(event) => setReferenceImage(event.target.files?.[0] ?? null)}
                       className="block w-full text-xs" />
                     <input aria-label="Nombre del personaje principal" placeholder="Nombre del protagonista (ej. Elena, Marco)" value={primaryName}
                       onChange={(event) => setPrimaryName(event.target.value)} maxLength={80}
                       className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-medium" />
                   </div>

                   {/* Co-Protagonista */}
                   <div className="space-y-2.5 p-4 rounded-xl border border-border bg-card/60">
                     <div className="flex items-center justify-between">
                       <Label htmlFor="kineva-second" className="text-xs font-bold flex items-center gap-1.5 uppercase tracking-wide">
                         <Users className="w-3.5 h-3.5" /> Segundo Protagonista / Rival
                       </Label>
                       <span className="text-[10px] text-muted-foreground font-semibold">Opcional</span>
                     </div>
                     <p className="text-[11px] text-muted-foreground">
                       Foto de referencia para el interés romántico, rival o compañero de escena.
                     </p>
                     <input id="kineva-second" type="file" accept="image/png,image/jpeg,image/webp"
                       onChange={(event) => setSecondaryImage(event.target.files?.[0] ?? null)}
                       className="block w-full text-xs" />
                     <input aria-label="Nombre del segundo personaje" placeholder="Nombre (co-protagonista o rival)" value={secondaryName}
                       onChange={(event) => setSecondaryName(event.target.value)} maxLength={80}
                       className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-medium" />
                   </div>
                 </div>

                 {/* Additional Cast slots (Secundarios, Antagonistas) */}
                 {customCast.filter(c => c.role !== "location" && c.role !== "key_object").length > 0 && (
                   <div className="space-y-2.5 pt-2">
                     <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                       Reparto adicional asignado ({customCast.filter(c => c.role !== "location" && c.role !== "key_object").length}):
                     </span>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                       {customCast.filter(c => c.role !== "location" && c.role !== "key_object").map((member) => (
                         <div key={member.id} className="p-3 rounded-lg border border-border bg-card/80 space-y-2 relative shadow-sm">
                           <div className="flex items-center justify-between gap-2">
                             <select
                               value={member.role}
                               onChange={(e) => updateCustomCastMember(member.id, { role: e.target.value as CastSlotRole })}
                               className="text-xs rounded border border-border bg-background px-2 py-1 font-semibold text-primary"
                             >
                               <option value="secondary">Personaje Secundario</option>
                               <option value="antagonist">Antagonista / Villano</option>
                             </select>
                             <Button
                               type="button"
                               variant="ghost"
                               size="icon"
                               className="h-6 w-6 text-muted-foreground hover:text-destructive"
                               onClick={() => removeCustomCastMember(member.id)}
                             >
                               <Trash2 className="w-3.5 h-3.5" />
                             </Button>
                           </div>
                           <input
                             placeholder="Nombre del personaje"
                             value={member.name}
                             onChange={(e) => updateCustomCastMember(member.id, { name: e.target.value })}
                             className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium"
                           />
                           <input
                             type="file"
                             accept="image/png,image/jpeg,image/webp"
                             onChange={(e) => updateCustomCastMember(member.id, { file: e.target.files?.[0] || null })}
                             className="block w-full text-xs"
                           />
                         </div>
                       ))}
                     </div>
                   </div>
                 )}

                 {/* Cast Gallery */}
                 <div className="pt-3 border-t border-border space-y-2">
                   <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                     Galería de Rostros Guardados (Asigna con un clic):
                   </span>
                   <CastGallery
                     userId={user.id}
                     onPrimary={(file, name) => { setReferenceImage(file); setPrimaryName(name); }}
                     onSecondary={(file, name) => { setSecondaryImage(file); setSecondaryName(name); }}
                     onSupporting={(file, name) => setSupportingCast((current) => current.some((actor) => actor.name === name) ? current : [...current, { file, name }])}
                     onAssignCustom={(file, name) => addCustomCastMember("secondary", name, file)}
                   />
                 </div>
               </TabsContent>

               {/* TAB 2: LOCACIONES */}
               <TabsContent value="locations" className="space-y-4 pt-3">
                 <div className="p-4 rounded-xl border border-border bg-card/60 space-y-3">
                   <div className="flex items-center justify-between">
                     <Label htmlFor="kineva-location" className="text-xs font-bold flex items-center gap-1.5 uppercase tracking-wide">
                       <MapPin className="w-3.5 h-3.5 text-primary" /> Set / Locación Principal
                     </Label>
                     <span className="text-[10px] text-muted-foreground font-semibold">Consistencia de Escenario</span>
                   </div>
                   <p className="text-[11px] text-muted-foreground">
                     Define el entorno donde transcurre la miniserie (mansión victoriana, bosque nocturno, penthouse, hospital). La IA mantendrá la misma iluminación y geometría.
                   </p>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                     <div className="space-y-2">
                       <input aria-label="Nombre del lugar" placeholder="Nombre del set (ej. Mansión Blackwood, Bar Neón)" value={locationName}
                         onChange={(event) => setLocationName(event.target.value)} maxLength={80}
                         className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-medium" />
                       <input aria-label="Descripción del lugar" placeholder="Iluminación, clima o atmósfera (ej. Lluvia torrencial, luces rojas tenues)" value={locationDescription}
                         onChange={(event) => setLocationDescription(event.target.value)} maxLength={400}
                         className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs" />
                     </div>
                     <div>
                       <input id="kineva-location" type="file" accept="image/png,image/jpeg,image/webp"
                         onChange={(event) => setLocationImage(event.target.files?.[0] ?? null)} className="block w-full text-xs" />
                       <p className="text-[10px] text-muted-foreground mt-1.5">
                         Sube una foto de referencia del decorado o set si quieres recrear un lugar específico.
                       </p>
                     </div>
                   </div>
                 </div>

                 {/* Additional Locations */}
                 {customCast.filter(c => c.role === "location").length > 0 && (
                   <div className="space-y-2.5 pt-2">
                     <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                       Locaciones Secundarias ({customCast.filter(c => c.role === "location").length}):
                     </span>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                       {customCast.filter(c => c.role === "location").map((loc) => (
                         <div key={loc.id} className="p-3 rounded-lg border border-border bg-card/80 space-y-2">
                           <div className="flex items-center justify-between">
                             <span className="text-xs font-bold text-primary flex items-center gap-1">
                               <MapPin className="w-3 h-3" /> Locación Adicional
                             </span>
                             <Button
                               type="button"
                               variant="ghost"
                               size="icon"
                               className="h-6 w-6 text-muted-foreground hover:text-destructive"
                               onClick={() => removeCustomCastMember(loc.id)}
                             >
                               <Trash2 className="w-3.5 h-3.5" />
                             </Button>
                           </div>
                           <input
                             placeholder="Nombre del set secundario"
                             value={loc.name}
                             onChange={(e) => updateCustomCastMember(loc.id, { name: e.target.value })}
                             className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium"
                           />
                         </div>
                       ))}
                     </div>
                   </div>
                 )}
               </TabsContent>

               {/* TAB 3: PROPS Y OBJETOS CLAVE */}
               <TabsContent value="props" className="space-y-4 pt-3">
                 <div className="p-4 rounded-xl border border-border bg-card/60 space-y-3">
                   <div className="flex items-center justify-between">
                     <Label className="text-xs font-bold flex items-center gap-1.5 uppercase tracking-wide">
                       <Box className="w-3.5 h-3.5 text-primary" /> Objetos de Interacción (Props)
                     </Label>
                     <Button
                       type="button"
                       variant="outline"
                       size="sm"
                       onClick={() => addCustomCastMember("key_object")}
                       className="text-xs h-7 gap-1"
                     >
                       <Plus className="w-3 h-3" /> Añadir Prop
                     </Button>
                   </div>
                   <p className="text-[11px] text-muted-foreground">
                     Los personajes interactúan con props físicos en cada toma: una cámara que se cae, una llave secreta, una copa de vino, un teléfono. Añade los objetos relevantes de la historia aquí.
                   </p>

                   {customCast.filter(c => c.role === "key_object").length === 0 ? (
                     <div className="py-6 text-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                       No hay props registrados. Pulsa <strong>+ Añadir Prop</strong> para registrar objetos clave (ej. Cámara réflex, Llave maestra, Linterna).
                     </div>
                   ) : (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                       {customCast.filter(c => c.role === "key_object").map((prop) => (
                         <div key={prop.id} className="p-3 rounded-lg border border-primary/30 bg-card/80 space-y-2">
                           <div className="flex items-center justify-between">
                             <span className="text-xs font-bold text-primary flex items-center gap-1">
                               <Box className="w-3 h-3" /> Prop Físico
                             </span>
                             <Button
                               type="button"
                               variant="ghost"
                               size="icon"
                               className="h-6 w-6 text-muted-foreground hover:text-destructive"
                               onClick={() => removeCustomCastMember(prop.id)}
                             >
                               <Trash2 className="w-3.5 h-3.5" />
                             </Button>
                           </div>
                           <input
                             placeholder="Nombre del objeto (ej. Cámara réflex negra, Teléfono con mensaje)"
                             value={prop.name}
                             onChange={(e) => updateCustomCastMember(prop.id, { name: e.target.value })}
                             className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium"
                           />
                         </div>
                       ))}
                     </div>
                   )}
                 </div>
               </TabsContent>
             </Tabs>
           </Card>

        <Card id="studio-editor" className="p-6 mb-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-medium">Producción de miniserie ({chapterCount} capítulos)</h2>
              <p className="text-sm text-muted-foreground">
                Escribe una idea. La IA prepara los {chapterCount} capítulos con tomas cinematográficas y diálogos listos para Wan 2.1.
              </p>
            </div>
            <Badge variant="secondary" className="text-xs uppercase">
              {studioGenre === "adult" ? "Adulto / NSFW" : `Género: ${studioGenre}`}
            </Badge>
          </div>

          <Textarea
            aria-label="Idea de la miniserie"
            placeholder="Ejemplo: una pareja investiga una mansión abandonada cuando las sombras cobran vida"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="min-h-[80px]"
          />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="bg-accent text-accent-foreground font-semibold hover:bg-accent/90"
              onClick={() => void draftThreeChapters()}
              disabled={draftingThree || generatingVideos}
            >
              {draftingThree ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Preparando {chapterCount} capítulos con IA…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" /> Generar guion de los {chapterCount} capítulos con IA
                </>
              )}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowManualEditor((value) => !value)}>
              {showManualEditor ? "Ocultar edición de escenas" : "Editar tomas manualmente"}
            </Button>
          </div>

          {/* Director Visual de Poses y Escenas Multi-Género */}
          <StudioPresetDirector
            chapterCount={chapterCount}
            activeGenre={studioGenre}
            onGenreSelect={(g) => {
              setStudioGenre(g);
              setIsSafeForWork(g !== "adult");
            }}
            initialCategory={isSafeForWork ? "sfw" : "nsfw"}
            onApplyScene={(chapterIndex, visualPrompt, suggestedLine) => {
              setManualScenes((current) =>
                current.map((s, i) => (i === chapterIndex ? visualPrompt : s))
              );
              if (suggestedLine) {
                setManualLines((current) =>
                  current.map((l, i) => (i === chapterIndex ? suggestedLine : l))
                );
              }
              setShowManualEditor(true);
              toast({
                title: `Escena configurada en Capítulo ${chapterIndex + 1}`,
                description: "Se inyectó el encuadre de cámara y prompt cinematográfico.",
              });
            }}
            onApplyArc={(arcTitle, chapters) => {
              setManualTitle(arcTitle);
              if (chapters.length > 0) {
                setChapterCount(chapters.length);
                setManualScenes(chapters.map((c) => c.visual));
                setManualLines(chapters.map((c) => c.line));
              }
              setShowManualEditor(true);
              toast({
                title: `Arco cinematográfico cargado: ${arcTitle}`,
                description: `Se configuraron ${chapters.length} capítulos con tomas y diálogos coordinados.`,
              });
            }}
          />

          {!novel && showManualEditor && <>
          {!!castRoles.length && <p className="text-sm text-muted-foreground">Reparto propuesto: {castRoles.map((actor) => `${actor.name}: ${actor.role}`).join(" · ")}</p>}
          <input aria-label="Título de la miniserie" placeholder="Título de la miniserie" value={manualTitle}
            onChange={(event) => setManualTitle(event.target.value)} maxLength={120}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />

          {manualScenes.slice(0, chapterCount).map((scene, index) => {
            const subShots = chapterSubShots[index] || [];
            return (
              <div key={index} className="space-y-3 border-t border-border pt-4 bg-muted/10 p-3 rounded-lg">
                <div className="flex items-center justify-between">
                  <Label htmlFor={"manual-scene-" + index} className="font-semibold text-sm">
                    Capítulo {index + 1}: Toma Principal (Master Shot)
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs text-primary hover:bg-primary/10 gap-1 h-7"
                    onClick={() => addSubShot(index)}
                  >
                    <Plus className="w-3.5 h-3.5" /> Añadir Subtoma / Ángulo
                  </Button>
                </div>
                <Textarea id={"manual-scene-" + index} value={scene} placeholder="Describe la acción cinematográfica o pose de la toma principal"
                  onChange={(event) => setManualScenes((current) => current.map((value, i) => i === index ? event.target.value : value))}
                  className="min-h-[70px]" maxLength={1200} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select aria-label={"Quién habla en el capítulo " + (index + 1)} value={manualSpeakers[index] || ""}
                    onChange={(event) => setManualSpeakers((current) => current.map((name, i) => i === index ? event.target.value : name))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs">
                    <option value="">Habla el personaje principal</option>
                    {allAvailableSpeakers.map((name) =>
                      <option key={name} value={name}>{name}</option>)}
                  </select>
                  <input aria-label={"Frase del capítulo " + (index + 1)} value={manualLines[index] || ""}
                    placeholder="Diálogo hablado en la toma principal (opcional)"
                    onChange={(event) => setManualLines((current) => current.map((value, i) => i === index ? event.target.value : value))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs" maxLength={400} />
                </div>

                {/* Sub-shots list */}
                {subShots.length > 0 && (
                  <div className="space-y-2.5 pl-3 border-l-2 border-primary/40 pt-2">
                    <span className="text-[11px] font-semibold text-primary uppercase tracking-wider flex items-center gap-1">
                      <Camera className="w-3 h-3" /> Subtomas adicionales ({subShots.length})
                    </span>
                    {subShots.map((sub, sIdx) => (
                      <div key={sub.id} className="p-2.5 rounded border border-border/80 bg-background space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">Toma {index + 1}.{sIdx + 2} (Ángulo secundario / Reacción)</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-muted-foreground hover:text-destructive"
                            onClick={() => removeSubShot(index, sIdx)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                        <Textarea
                          placeholder="Describe el ángulo secundario (ej. Primer plano reacción, detalle manos, contraplano)"
                          value={sub.visual}
                          onChange={(e) => updateSubShot(index, sIdx, "visual", e.target.value)}
                          className="min-h-[50px] text-xs"
                          maxLength={1200}
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <select
                            value={sub.speaker}
                            onChange={(e) => updateSubShot(index, sIdx, "speaker", e.target.value)}
                            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
                          >
                            <option value="">Quién habla en esta toma</option>
                            {allAvailableSpeakers.map((name) => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                          </select>
                          <input
                            placeholder="Línea de diálogo o sonido específico"
                            value={sub.dialogue}
                            onChange={(e) => updateSubShot(index, sIdx, "dialogue", e.target.value)}
                            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
                            maxLength={400}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {seriesEpisodeIds[index] && savedSeriesId && <Button type="button" size="sm" variant="secondary" disabled={generatingVideos}
                  onClick={() => void regenerateChapter(index)}>Regenerar solo capítulo {index + 1}</Button>}
              </div>
            );
          })}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="flex-1 h-14 text-base font-semibold"
              onClick={() => void handleSaveManualDraftOnly()}
              disabled={generating || generatingVideos || savingDraft || !showManualEditor}
            >
              {savingDraft ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Guardando cambios…
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 mr-2" /> Guardar cambios del guion
                </>
              )}
            </Button>
            <Button
              type="button"
              size="lg"
              className="flex-1 h-14 text-base font-semibold"
              onClick={() => void handleManualSeries()}
              disabled={generating || generatingVideos || draftingThree || savingDraft || !showManualEditor}
            >
              {generatingVideos ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" /> {videoProgress || "Filmando con ComfyUI en tu PC…"}
                </>
              ) : (
                <>
                  <Clapperboard className="w-5 h-5 mr-2" /> Filmar los {chapterCount} capítulos en ComfyUI (GPU local)
                </>
              )}
            </Button>
          </div>
          </>}
        </Card>

        {/* Generar proyecto completo con IA solo cuando no se usa el editor de 3 capítulos */}
        {localJob && (
          <Card className="p-6 mb-6 space-y-4">
            <h2 className="text-lg font-medium">Video en esta PC</h2>
            <p role="status">
              {localJob.state === "queued" ? "En cola…"
                : localJob.state === "references_ready" ? "Preparando referencias…"
                : localJob.state === "video_review" ? "Finalizando una toma…"
                : localJob.state === "rendering" ? `Creando video ${localJob.current} de ${localJob.total}…`
                : localJob.state === "failed" ? `Error: ${localJob.error || "Kineva no pudo crear el video."}`
                : "Capítulos generados. Puedes reproducirlos o descargarlos."}
            </p>
            {localJob.references && localJob.state === "references_ready" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {Object.entries(localJob.references).map(([key, url]) => (
                  <figure key={key}><img src={localVideoSrc(url)} alt={key} className="w-full rounded-md" />
                    <figcaption className="text-xs mt-1">{key === "primary" ? "Personaje principal" : key === "secondary" ? "Segundo personaje" : "Lugar"}</figcaption>
                  </figure>
                ))}
              </div>
            )}
            {localJob.preview && localJob.state === "video_review" && (
              <div>
                <h3 className="text-sm font-medium">Capítulo {localJob.preview.episode}, toma {localJob.preview.shot} de {localJob.preview.total_shots}</h3>
                <video controls className="mt-2 w-full rounded-md" src={localVideoSrc(localJob.preview.url)} />
                <p className="text-sm text-muted-foreground">La serie continúa automáticamente tras el control técnico.</p>
              </div>
            )}
            {localJob.videos?.map((video) => (
              <div key={video.url}>
                <h3 className="text-sm font-medium">Escena del capítulo {video.episode}</h3>
                <video controls className="mt-2 w-full rounded-md" src={localVideoSrc(video.url)} />
                <Button type="button" variant="outline" size="sm" className="mt-2"
                  onClick={() => void downloadLocalChapter(video.url, video.episode)}>Descargar MP4</Button>
                {localJob.state === "completed" && seriesEpisodeIds[video.episode - 1] && <Button type="button" variant="secondary" size="sm" className="mt-2 ml-2"
                  onClick={() => { setShowManualEditor(true); document.getElementById("studio-editor")?.scrollIntoView({ behavior: "smooth" }); }}>Editar escena y regenerar</Button>}
              </div>
            ))}
          </Card>
        )}

        {novel && (
          <Card id="studio-novel-card" className="p-6 mb-6 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex-1">
                <input
                  aria-label="Título de la miniserie"
                  value={novel.title || ""}
                  onChange={(e) => setNovel((prev: any) => prev ? ({ ...prev, title: e.target.value }) : prev)}
                  placeholder="Título de la miniserie"
                  className="font-display text-2xl font-bold bg-transparent border-b border-border/60 pb-1 w-full focus:outline-none focus:border-primary"
                />
                {savedSeriesId && (
                  <a href="#studio-production" className="mt-2 inline-block text-xs uppercase tracking-[0.16em] text-accent">
                    Ver borrador privado en Producción
                  </a>
                )}
                {novel.logline && (
                  <p className="text-sm text-muted-foreground mt-1">{novel.logline}</p>
                )}
              </div>
            </div>

            {Array.isArray(novel.characters) && novel.characters.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm uppercase tracking-[0.2em] text-accent">
                  Biblia de personajes (persistente)
                </h3>
                {novel.characters.map((c: any, i: number) => (
                  <div key={i} className="border border-border p-3 text-sm space-y-1">
                    <p className="font-medium">
                      {c.name} {c.age ? `· ${c.age}` : ""} {c.role ? `· ${c.role}` : ""}
                    </p>
                    <p className="text-muted-foreground">{c.appearance}</p>
                    {c.wardrobe && <p className="text-muted-foreground">Vestuario: {c.wardrobe}</p>}
                    {c.visual_prompt && (
                      <p className="text-xs font-mono text-accent/80 break-words">
                        {c.visual_prompt}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {novel.setting?.visual_style && (
              <div className="border border-border p-3 text-sm">
                <p className="font-medium mb-1">Estilo visual de la serie</p>
                <p className="text-xs font-mono text-accent/80 break-words">
                  {novel.setting.visual_style}
                </p>
              </div>
            )}

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm uppercase tracking-[0.2em] text-accent">Capítulos de la miniserie</h3>
                <span className="text-xs text-muted-foreground">{(novel.chapters ?? []).length} capítulos listos para filmar</span>
              </div>
              {(novel.chapters ?? []).map((ch: any, i: number) => (
                <div key={i} className="border border-border p-4 rounded-lg space-y-3 bg-muted/10">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="font-display font-bold text-accent">{ch.number || i + 1}.</span>
                      <input
                        aria-label={"Título del capítulo " + (ch.number || i + 1)}
                        value={ch.title || ""}
                        onChange={(e) => updateChapterField(i, "title", e.target.value)}
                        placeholder="Título del capítulo"
                        className="font-display text-base font-semibold bg-transparent border-none focus:outline-none focus:ring-0 flex-1"
                      />
                    </div>
                    <Button variant="outline" size="sm" disabled={illustratingChapter !== null}
                      onClick={() => illustrateChapter(ch, i)} className="gap-1.5 text-xs h-8">
                      {illustratingChapter === i ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      {chapterImages[i] ? "Recrear imagen" : "Ilustrar capítulo"}
                    </Button>
                  </div>

                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1 block">Guion / Narración completa del capítulo</Label>
                    <Textarea
                      value={ch.content || ""}
                      onChange={(e) => updateChapterField(i, "content", e.target.value)}
                      placeholder="Escribe la historia y acciones completas de este capítulo..."
                      className="min-h-[100px] text-sm leading-relaxed"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-1 block">Toma visual y encuadre para Wan 2.1</Label>
                      <Textarea
                        value={ch.video_prompt || ""}
                        onChange={(e) => updateChapterField(i, "video_prompt", e.target.value)}
                        placeholder="Descripción visual de la escena, ángulo y atmósfera"
                        className="min-h-[50px] text-xs font-mono"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-1 block">Diálogo hablado o voz en español</Label>
                      <input
                        value={ch.spoken_line || ""}
                        onChange={(e) => updateChapterField(i, "spoken_line", e.target.value)}
                        placeholder="Frase hablada por el personaje en español"
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs h-[50px]"
                      />
                    </div>
                  </div>

                  {chapterImages[i] && (
                    <img src={chapterImages[i]} alt={"Escena del capítulo " + (i + 1)}
                      className="w-full max-w-md rounded-md mt-2" />
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="flex-1 h-14 text-base font-semibold"
                onClick={() => void handleSaveNovelChanges()}
                disabled={generatingVideos || savingDraft}
              >
                {savingDraft ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
                Guardar cambios del guion
              </Button>
              <Button
                size="lg"
                className="flex-1 h-14 text-base font-semibold"
                onClick={handleGenerateVideos}
                disabled={generatingVideos || generating}
              >
                {generatingVideos ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" /> {videoProgress || "Generando videos…"}
                  </>
                ) : (
                  <>
                    <Clapperboard className="w-5 h-5 mr-2" /> Filmar cada capítulo con ComfyUI en esta PC
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              ComfyUI filma el texto y tomas de cada capítulo usando tu GPU y el video queda guardado dentro de la novela.
            </p>
          </Card>
        )}

      </div>
    </MainLayout>
  );
};

export default Studio;
