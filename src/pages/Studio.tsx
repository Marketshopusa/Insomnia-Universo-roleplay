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

import { Clapperboard, Loader2, Sparkles, Plus, Trash2, Camera, UserPlus, Users, Film, ShieldAlert, Sparkle, Save, MapPin, Box, GitFork, Eye, Play, CheckCircle2, AlertCircle, Tv } from "lucide-react";

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



const chapterOptions = [1, 3, 5, 7, 10, 12, 15, 20];



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



  const [studioTab, setStudioTab] = useState<"script" | "elements" | "filming" | "catalog">(() => {

    if (typeof window !== "undefined") {

      const tab = new URLSearchParams(window.location.search).get("tab");

      if (tab === "elements" || tab === "filming" || tab === "catalog") return tab;

    }

    return "script";

  });

  const [model, setModel] = useState("wan-2.1");

  const [referenceImage, setReferenceImage] = useState<File | null>(null);

  const [primaryName, setPrimaryName] = useState("");

  const [secondaryName, setSecondaryName] = useState("");

  const [secondaryImage, setSecondaryImage] = useState<File | null>(null);

  const [supportingCast, setSupportingCast] = useState<{ name: string; file: File }[]>([]);
  const [showAdvancedCast, setShowAdvancedCast] = useState(false);

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

  const [chapterCount, setChapterCount] = useState(3);

  const [studioGenre, setStudioGenre] = useState<StudioGenre>("adult");

  const [manualScenes, setManualScenes] = useState<string[]>(Array(3).fill(""));

  const [manualLines, setManualLines] = useState<string[]>(Array(3).fill(""));

  const [manualSpeakers, setManualSpeakers] = useState<string[]>(Array(3).fill(""));

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

        setStudioTab("script");

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

    const effectivePrimary = primaryName.trim() || String(first.name || "").slice(0, 80) || manualSpeakers.find(Boolean) || "Protagonista";
    const effectiveLocName = locationName.trim() || String(setting.place || "").slice(0, 80) || (description.toLowerCase().includes("lago") ? "Campamento en el Lago" : "");
    const effectiveLocDesc = locationDescription.trim() || String([setting.place, setting.time, setting.visual_style].filter(Boolean).join(". ")).slice(0, 500) || (description.toLowerCase().includes("lago") ? "Campamento nocturno a orillas de un lago oscuro, fogata encendida con brasas, pinos y agua oscura de fondo." : "");
    const cast = {
      primary_name: effectivePrimary,
      primary_description: image ? "" : String(first.visual_prompt || [first.appearance, first.wardrobe].filter(Boolean).join(". ")).slice(0, 500),
      secondary_name: secondaryName.trim() || (secondaryImage ? "" : String(second.name || "").slice(0, 80)),
      secondary_description: secondaryImage ? "" : String(second.visual_prompt || [second.appearance, second.wardrobe].filter(Boolean).join(". ")).slice(0, 500),
      secondary_image: secondaryImage ? await encodeLocalImage(secondaryImage) : null,
      supporting,
      location_name: effectiveLocName,
      location_description: effectiveLocDesc,
      location_image: locationImage ? await encodeLocalImage(locationImage) : null,
    };

    const shotPlans = chapters.map((chapText, index) => {

      const mainVisual = String(manualScenes[index] || chapText || "").trim();

      const mainDialogue = String(manualLines[index] || dialogues[index] || "").trim();

      const mainSpeaker = String(manualSpeakers[index] || effectivePrimary).trim();

      const mainShot = { visual: mainVisual, dialogue: mainDialogue, speaker: mainSpeaker };



      const subShots = (chapterSubShots[index] || []).map((s) => ({

        visual: String(s.visual || "").trim(),

        dialogue: String(s.dialogue || "").trim(),

        speaker: String(s.speaker || mainSpeaker || primaryName || "").trim(),

      })).filter((s) => s.visual.length >= 3);



      const allShots = [mainShot, ...subShots].filter((s) => s.visual.length >= 3);

      return allShots.length ? allShots : [{ visual: chapText, dialogue: dialogues[index] || "", speaker: primaryName || "" }];

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

      // Auto-enlazar personajes del guion al reparto si los nombres son genericos
      const draftNames: string[] = [];
      if (Array.isArray(draft.cast_roles)) {
        draft.cast_roles.forEach((cr: any) => {
          if (cr?.name && typeof cr.name === "string" && !draftNames.includes(cr.name.trim())) {
            draftNames.push(cr.name.trim());
          }
        });
      }
      returnedChapters.forEach((ch: any) => {
        if (ch?.speaker && typeof ch.speaker === "string" && !draftNames.includes(ch.speaker.trim())) {
          draftNames.push(ch.speaker.trim());
        }
      });
      const isGeneric = (n: string) => !n || /^(captura|screenshot|img|image|foto|actor|personaje|protagonista)/i.test(n.trim());
      if (draftNames.length > 0) {
        if (isGeneric(primaryName) && draftNames[0]) setPrimaryName(draftNames[0]);
        if (isGeneric(secondaryName) && draftNames[1]) setSecondaryName(draftNames[1]);
        if (supportingCast.length > 0) {
          setSupportingCast((curr) => curr.map((act, idx) => {
            const assigned = draftNames[2 + idx];
            return (assigned && isGeneric(act.name)) ? { ...act, name: assigned } : act;
          }));
        }
      }
      if (!locationName.trim()) {
        const textToScan = `${draft.title || ""} ${idea || ""}`.toLowerCase();
        if (textToScan.includes("lago") || textToScan.includes("bosque") || textToScan.includes("campamento")) {
          setLocationName("Campamento en el Lago");
          setLocationDescription("Campamento nocturno a orillas de un lago oscuro, fogata encendida con brasas, altos pinos y agua oscura de fondo.");
        }
      }



      // Poblar subtomas / ángulos complementarios si la IA los generó

      const newSubShots: Record<number, { id: string; visual: string; dialogue: string; speaker: string }[]> = {};

      returnedChapters.forEach((chapter: any, chIdx: number) => {

        const subs = Array.isArray(chapter.sub_shots) ? chapter.sub_shots : (Array.isArray(chapter.subShots) ? chapter.subShots : []);

        if (subs.length > 0) {

          newSubShots[chIdx] = subs.slice(0, 16).map((sub: any, sIdx: number) => ({

            id: `shot-${chIdx}-${sIdx}-${Date.now()}`,

            visual: String(sub.visual || "").slice(0, 1200),

            dialogue: String(sub.dialogue || "").slice(0, 400),

            speaker: String(sub.speaker || manualSpeakers[chIdx] || primaryName || "").slice(0, 80),

          }));

        }

      });

      setChapterSubShots(newSubShots);



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

    setStudioTab("filming");

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

      setStudioTab("filming");

      toast({ title: "Iniciando rodaje en ComfyUI", description: "Cambiando al Monitor de Rodaje en Vivo..." });

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

     setChapterCount(3);

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

       <div className="container mx-auto px-4 py-6 max-w-6xl space-y-6">

        {/* Header Cinematográfico Pro */}

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-border/60 pb-5">

          <div>

            <div className="flex items-center gap-2 mb-1.5">

              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5 shadow-sm">

                <Film className="w-3.5 h-3.5" /> Insomnia Cinematographic Studio

              </span>

              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-muted/60 text-muted-foreground border border-border">

                Showrunner · LTX Elements · Wan 2.1

              </span>

            </div>

            <h1 className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight text-foreground">

              Estudio de Creación de Miniseries

            </h1>

            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">

              Dirección por capas: roles y casting coherentes, locaciones fijas, guion multi-toma y render episódico.

            </p>

          </div>

          <div className="flex items-center gap-3">

            <div className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-2 ${

              localHealth === "ready" 

                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 

                : "bg-amber-500/10 border-amber-500/30 text-amber-300"

            }`}>

              <span className={`w-2 h-2 rounded-full ${localHealth === "ready" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />

              <span>{localHealth === "ready" ? "Kineva GPU Local Listo (127.0.0.1:8787)" : "Modo Cloud / Worker Standby"}</span>

            </div>

          </div>

        </div>



        {/* Banner Flotante de Filmación Activa en ComfyUI */}

        {(generatingVideos || (localJob && ["rendering", "queued", "video_review", "references_ready"].includes(localJob.state))) && (

          <div className="mb-6 p-4 rounded-xl border border-primary/50 bg-gradient-to-r from-primary/15 via-background to-accent/10 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">

            <div className="flex items-center gap-3">

              <span className="relative flex h-3.5 w-3.5">

                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>

                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span>

              </span>

              <div>

                <p className="text-sm font-bold text-foreground flex items-center gap-2">

                  <span>Filmación activa en ComfyUI (GPU Local)</span>

                  <Badge variant="outline" className="text-[10px] font-mono border-primary/40 bg-primary/10">

                    Capítulo {localJob?.current || 1} de {localJob?.total || chapterCount}

                  </Badge>

                </p>

                <p className="text-xs text-muted-foreground mt-0.5">

                  {videoProgress || (localJob?.state === "rendering"

                    ? `Renderizando fotogramas del capítulo ${localJob?.current || 1} con Wan 2.1...`

                    : localJob?.state === "references_ready"

                      ? "Consolidando consistencia facial del protagonista..."

                      : "Procesando tomas cinematográficas...")}

                </p>

              </div>

            </div>

            <div className="flex items-center gap-2">

              {studioTab !== "filming" && (

                <Button

                  size="sm"

                  onClick={() => setStudioTab("filming")}

                  className="text-xs font-semibold gap-1.5 shadow bg-primary text-primary-foreground hover:bg-primary/90"

                >

                  <Eye className="w-3.5 h-3.5" /> Ver en Monitor de Rodaje

                </Button>

              )}

            </div>

          </div>

        )}



        {/* Pestañas de Dirección de Estudio */}

        <Tabs value={studioTab} onValueChange={(v) => setStudioTab(v as any)} className="w-full space-y-6">
          <TabsList className="grid grid-cols-2 max-w-xl mx-auto w-full h-auto p-1.5 bg-card/60 backdrop-blur-md border border-border/80 rounded-xl shadow-inner">
            <TabsTrigger value="script" className="flex items-center justify-center gap-2 py-3 text-xs sm:text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
              <Sparkles className="w-4 h-4" />
              <span>1. Estudio de Creación (Paso a Paso)</span>
            </TabsTrigger>
            <TabsTrigger value="filming" className="flex items-center justify-center gap-2 py-3 text-xs sm:text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
              <Clapperboard className="w-4 h-4" />
              <span>2. Sala de Rodaje y Series</span>
              {(generatingVideos || (localJob && ["rendering", "queued", "video_review"].includes(localJob.state))) && (
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse ml-1.5" />
              )}
            </TabsTrigger>
          </TabsList>

          {/* VISTA 1: ESTUDIO DE CREACIÓN LINEAL PASO A PASO */}
          <TabsContent value="script" className="space-y-6 m-0 focus-visible:outline-none">

            {/* PASO 1: TU HISTORIA Y GÉNERO */}
            <Card id="studio-editor" className="p-6 space-y-5 border-border/80 bg-card/60 backdrop-blur-sm shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/40">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 text-primary font-bold flex items-center justify-center text-sm shadow-sm">
                    1
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                      Paso 1: Tu Historia y Género
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Define el formato, duración y la idea central de tu miniserie.
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs uppercase tracking-wider font-semibold">
                  {studioGenre === "adult" ? "Adulto / NSFW" : `Género: ${studioGenre}`}
                </Badge>
              </div>

              {/* Formato y duración */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Estructura dramática y duración:
                </Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { count: 1, label: "1 Capítulo (Piloto 2 Minutos / Multi-toma)" },
                    { count: 3, label: "3 Capítulos (Trilogía de impacto)" },
                    { count: 5, label: "5 Capítulos (Arco estándar)" },
                    { count: 7, label: "7 Capítulos (Miniserie completa)" },
                    { count: 10, label: "10 Capítulos (Temporada vertical)" },
                  ].map((opt) => (
                    <Button
                      key={opt.count}
                      type="button"
                      variant={chapterCount === opt.count ? "default" : "outline"}
                      size="sm"
                      className={`h-8 px-3 text-xs font-medium transition-all ${
                        chapterCount === opt.count
                          ? "bg-primary text-primary-foreground shadow"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                      onClick={() => handleChapterCountChange(opt.count)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Selector de Género */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Tono y género cinematográfico:
                </Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: "horror", label: "👻 Terror / Misterio", nsfw: false },
                    { id: "action", label: "💥 Acción / Suspenso", nsfw: false },
                    { id: "romance", label: "❤️ Romance / Drama", nsfw: false },
                    { id: "scifi", label: "🚀 Sci-Fi / Cyberpunk", nsfw: false },
                    { id: "fantasy", label: "🔮 Fantasía Épica", nsfw: false },
                    { id: "adult", label: "🔥 Adulto / NSFW", nsfw: true },
                  ].map((g) => (
                    <Button
                      key={g.id}
                      type="button"
                      variant={studioGenre === g.id ? "default" : "outline"}
                      size="sm"
                      className={`h-8 px-3 text-xs font-medium transition-all ${
                        studioGenre === g.id
                          ? "bg-accent text-accent-foreground font-semibold shadow"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                      onClick={() => {
                        setStudioGenre(g.id as any);
                        setIsSafeForWork(!g.nsfw);
                      }}
                    >
                      {g.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Idea de la historia */}
              <div className="space-y-2">
                <Label htmlFor="studio-description" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Idea central de la historia:
                </Label>
                <Textarea
                  id="studio-description"
                  aria-label="Idea de la miniserie"
                  placeholder="Ejemplo: Una pareja de investigadores acampa en la orilla de un lago en la noche. Al escuchar un susurro entre la niebla, descubren una criatura acechando..."
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="min-h-[85px] text-sm bg-background/80"
                />
              </div>
            </Card>

            {/* PASO 2: EL REPARTO Y ESCENARIO */}
            <Card className="p-6 space-y-5 border-border/80 bg-card/60 backdrop-blur-sm shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/40">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 text-primary font-bold flex items-center justify-center text-sm shadow-sm">
                    2
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                      Paso 2: El Reparto y Escenario
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Elige los personajes principales y el lugar fijo del rodaje para garantizar coherencia cuadro a cuadro.
                    </p>
                  </div>
                </div>
              </div>

              {/* Tarjetas del Reparto Principal y Escenario */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Protagonista */}
                <div className="p-4 rounded-xl border-2 border-primary/40 bg-primary/5 space-y-3 relative">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-primary flex items-center gap-1.5 uppercase tracking-wide">
                      <Users className="w-3.5 h-3.5" /> ⭐ Protagonista
                    </span>
                    <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">Rostro Ancla</span>
                  </div>
                  <div className="space-y-2">
                    <input
                      aria-label="Nombre del protagonista"
                      placeholder="Nombre (ej. Carlos, Elena)"
                      value={primaryName}
                      onChange={(event) => setPrimaryName(event.target.value)}
                      maxLength={80}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        id="kineva-reference"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) => setReferenceImage(event.target.files?.[0] ?? null)}
                        className="block w-full text-[11px]"
                      />
                      {referenceImage && (
                        <span className="text-[10px] text-green-500 font-bold whitespace-nowrap">✓ Foto lista</span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Foto fija para consistencia con Wan 2.1 e IP-Adapter.
                    </p>
                  </div>
                </div>

                {/* Co-Protagonista */}
                <div className="p-4 rounded-xl border border-border bg-card/60 space-y-3 relative">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1.5 uppercase tracking-wide">
                      <Users className="w-3.5 h-3.5" /> 🎭 Co-Protagonista
                    </span>
                    <span className="text-[10px] text-muted-foreground font-semibold">Opcional</span>
                  </div>
                  <div className="space-y-2">
                    <input
                      aria-label="Nombre del segundo personaje"
                      placeholder="Nombre (ej. Marta, Javier)"
                      value={secondaryName}
                      onChange={(event) => setSecondaryName(event.target.value)}
                      maxLength={80}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        id="kineva-second"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) => setSecondaryImage(event.target.files?.[0] ?? null)}
                        className="block w-full text-[11px]"
                      />
                      {secondaryImage && (
                        <span className="text-[10px] text-green-500 font-bold whitespace-nowrap">✓ Foto lista</span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Para escenas en pareja, diálogos o enfrentamientos.
                    </p>
                  </div>
                </div>

                {/* Set / Escenario */}
                <div className="p-4 rounded-xl border border-border bg-card/60 space-y-3 relative">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1.5 uppercase tracking-wide">
                      <MapPin className="w-3.5 h-3.5 text-primary" /> 📍 Set / Locación
                    </span>
                    <span className="text-[10px] text-muted-foreground font-semibold">Anclaje Escénico</span>
                  </div>
                  <div className="space-y-2">
                    <input
                      aria-label="Nombre del lugar"
                      placeholder="Nombre del set (ej. Cabaña en el lago)"
                      value={locationName}
                      onChange={(event) => setLocationName(event.target.value)}
                      maxLength={80}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold"
                    />
                    <input
                      aria-label="Descripción del lugar"
                      placeholder="Atmósfera (ej. Bosque nocturno, niebla, muelle)"
                      value={locationDescription}
                      onChange={(event) => setLocationDescription(event.target.value)}
                      maxLength={400}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        id="kineva-location"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) => setLocationImage(event.target.files?.[0] ?? null)}
                        className="block w-full text-[11px]"
                      />
                      {locationImage && (
                        <span className="text-[10px] text-green-500 font-bold whitespace-nowrap">✓ Foto set</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Galería de Rostros (CastGallery simplificada) */}
              <div className="pt-2 border-t border-border/40 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Galería de Personajes Guardados:
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Asigna ⭐ Protagonista o 🎭 Co-Estrella en 1 clic.
                  </span>
                </div>
                <CastGallery
                  userId={user.id}
                  onPrimary={(file, name) => {
                    setReferenceImage(file);
                    const clean = (/^(captura|screenshot|img|image|foto)/i.test(name) || !name.trim()) ? "Carlos" : name;
                    setPrimaryName(clean);
                    toast({ title: `⭐ ${clean} asignado como Protagonista` });
                  }}
                  onSecondary={(file, name) => {
                    setSecondaryImage(file);
                    const clean = (/^(captura|screenshot|img|image|foto)/i.test(name) || !name.trim()) ? "Marta" : name;
                    setSecondaryName(clean);
                    toast({ title: `🎭 ${clean} asignado como Co-Protagonista` });
                  }}
                  onSupporting={(file, name) => {
                    const clean = (/^(captura|screenshot|img|image|foto)/i.test(name) || !name.trim()) ? `Actor ${supportingCast.length + 1}` : name;
                    setSupportingCast((current) => current.some((actor) => actor.name === clean) ? current : [...current, { file, name: clean }]);
                  }}
                  onAssignCustom={(file, name) => addCustomCastMember("secondary", name, file)}
                />
              </div>

              {/* Opciones avanzadas de reparto adicional y objetos (Opcional colapsable) */}
              <div className="pt-1 border-t border-border/30">
                <button
                  type="button"
                  onClick={() => setShowAdvancedCast((v) => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 font-medium transition-colors"
                >
                  <span>{showAdvancedCast ? "▲ Ocultar reparto adicional y props" : "▼ Opciones avanzadas: Reparto adicional y objetos clave (props)"}</span>
                </button>
                {showAdvancedCast && (
                  <div className="mt-3 p-4 rounded-xl border border-border/60 bg-muted/20 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">Reparto Adicional (Villanos, Secundarios):</span>
                      <Button type="button" variant="outline" size="sm" onClick={() => addCustomCastMember("secondary")} className="text-xs h-7">
                        + Añadir personaje extra
                      </Button>
                    </div>
                    {customCast.filter(c => c.role !== "location" && c.role !== "key_object").length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {customCast.filter(c => c.role !== "location" && c.role !== "key_object").map((member) => (
                          <div key={member.id} className="p-3 rounded-lg border border-border bg-card/80 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <select
                                value={member.role}
                                onChange={(e) => updateCustomCastMember(member.id, { role: e.target.value as CastSlotRole })}
                                className="text-xs rounded border border-border bg-background px-2 py-1 font-semibold text-primary"
                              >
                                <option value="secondary">Personaje Secundario</option>
                                <option value="antagonist">Antagonista / Villano</option>
                              </select>
                              <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeCustomCastMember(member.id)}>
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
                    )}
                    <div className="pt-2 border-t border-border/40">
                      <span className="text-xs font-semibold block mb-2">Objeto clave / Prop (Opcional):</span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input
                          placeholder="Nombre del objeto (ej. Linterna antigua, Daga)"
                          value={keyObjectName}
                          onChange={(e) => setKeyObjectName(e.target.value)}
                          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
                        />
                        <input
                          placeholder="Descripción del objeto"
                          value={keyObjectDescription}
                          onChange={(e) => setKeyObjectDescription(e.target.value)}
                          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* PASO 3: GUION CINEMÁTICO CON IA */}
            <Card className="p-6 space-y-5 border-border/80 bg-card/60 backdrop-blur-sm shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/40">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 text-primary font-bold flex items-center justify-center text-sm shadow-sm">
                    3
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                      Paso 3: Guion Cinemático con IA
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      La inteligencia desglosa las tomas cinematográficas, encuadres dinámicos y diálogos con voz neural y lip-sync.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  className="bg-accent text-accent-foreground font-semibold hover:bg-accent/90 shadow-md"
                  onClick={() => void draftThreeChapters()}
                  disabled={draftingThree || generatingVideos}
                >
                  {draftingThree ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {chapterCount === 1 ? "Escribiendo Piloto de 2 Minutos..." : `Preparando ${chapterCount} capítulos con IA...`}
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      {chapterCount === 1 ? "Generar Guion del Piloto (2 Minutos Multi-toma)" : `Generar Guion (${chapterCount} Capítulos) con IA`}
                    </>
                  )}
                </Button>
              </div>

              {/* Vista Previa de los Capítulos Generados */}
              {manualScenes.some(s => s.trim().length > 0) && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-primary uppercase tracking-wider">
                      Tomas y Capítulos del Guion ({chapterCount}):
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground hover:text-foreground h-7"
                      onClick={() => setShowManualEditor((v) => !v)}
                    >
                      {showManualEditor ? "▲ Ocultar editor de tomas" : "⚙️ Ajustar diálogos o poses a mano"}
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {manualScenes.slice(0, chapterCount).map((scene, index) => {
                      const speaker = manualSpeakers[index] || primaryName || "Protagonista";
                      const line = manualLines[index] || "";
                      const subShots = chapterSubShots[index] || [];
                      return (
                        <div key={index} className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-foreground flex items-center gap-2">
                              <Film className="w-3.5 h-3.5 text-primary" />
                              {chapterCount === 1 ? `Toma ${index + 1} de la Secuencia Piloto (2 Min)` : `Capítulo ${index + 1}`}
                            </span>
                            <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-semibold">
                              {speaker}: Voz Neural Activa (Wan Lip-Sync)
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            <span className="font-semibold text-foreground">Acción / Visual: </span>
                            {scene || "Sin descripción de toma aún."}
                          </p>
                          {line && (
                            <div className="p-2 rounded-lg bg-background/60 border border-border/40 text-xs">
                              <span className="font-semibold text-primary">{speaker}: </span>
                              <span className="italic font-medium">"{line}"</span>
                            </div>
                          )}
                          {subShots.length > 0 && (
                            <div className="text-[11px] text-muted-foreground pl-3 border-l-2 border-primary/30">
                              + {subShots.length} subtomas / ángulos encadenados
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Acordeón de Edición Manual y Director de Poses (Opcional) */}
              {showManualEditor && (
                <div className="p-4 rounded-xl border border-border/80 bg-card/80 space-y-4">
                  <div className="flex items-center justify-between border-b border-border/40 pb-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Editor Avanzado de Tomas y Diálogos
                    </h4>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowManualEditor(false)} className="text-xs h-6">
                      Cerrar
                    </Button>
                  </div>

                  <StudioPresetDirector
                    chapterCount={chapterCount}
                    activeGenre={studioGenre}
                    onGenreSelect={(g) => {
                      setStudioGenre(g);
                      setIsSafeForWork(g !== "adult");
                    }}
                    initialCategory={isSafeForWork ? "sfw" : "nsfw"}
                    onApplyScene={(chapterIndex, visualPrompt, suggestedLine) => {
                      setManualScenes((current) => current.map((s, i) => (i === chapterIndex ? visualPrompt : s)));
                      if (suggestedLine) {
                        setManualLines((current) => current.map((l, i) => (i === chapterIndex ? suggestedLine : l)));
                      }
                      toast({ title: `Escena configurada en Capítulo ${chapterIndex + 1}` });
                    }}
                    onApplyArc={(arcTitle, chapters) => {
                      setManualTitle(arcTitle);
                      if (chapters.length > 0) {
                        setChapterCount(chapters.length);
                        setManualScenes(chapters.map((c) => c.visual));
                        setManualLines(chapters.map((c) => c.line));
                      }
                      toast({ title: `Arco cargado: ${arcTitle}` });
                    }}
                  />

                  <input
                    aria-label="Título de la miniserie"
                    placeholder="Título de la miniserie"
                    value={manualTitle}
                    onChange={(event) => setManualTitle(event.target.value)}
                    maxLength={120}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />

                  {manualScenes.slice(0, chapterCount).map((scene, index) => {
                    const subShots = chapterSubShots[index] || [];
                    return (
                      <div key={index} className="space-y-3 border-t border-border/60 pt-3 bg-muted/10 p-3 rounded-lg">
                        <div className="flex items-center justify-between">
                          <Label htmlFor={"manual-scene-" + index} className="font-semibold text-xs">
                            Capítulo {index + 1}: Toma Principal (Master Shot)
                          </Label>
                          <Button type="button" variant="ghost" size="sm" className="text-xs text-primary hover:bg-primary/10 gap-1 h-7" onClick={() => addSubShot(index)}>
                            <Plus className="w-3.5 h-3.5" /> Añadir Subtoma
                          </Button>
                        </div>
                        <Textarea
                          id={"manual-scene-" + index}
                          value={scene}
                          placeholder="Describe la acción cinematográfica o pose de la toma principal"
                          onChange={(event) => setManualScenes((current) => current.map((value, i) => i === index ? event.target.value : value))}
                          className="min-h-[70px] text-xs"
                          maxLength={1200}
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <select
                            aria-label={"Quién habla en el capítulo " + (index + 1)}
                            value={manualSpeakers[index] || ""}
                            onChange={(event) => setManualSpeakers((current) => current.map((name, i) => i === index ? event.target.value : name))}
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs"
                          >
                            <option value="">Habla el protagonista ({primaryName})</option>
                            {allAvailableSpeakers.map((name) => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                          </select>
                          <input
                            placeholder="Línea de diálogo hablada (español latino)"
                            value={manualLines[index] || ""}
                            onChange={(event) => setManualLines((current) => current.map((value, i) => i === index ? event.target.value : value))}
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs"
                            maxLength={400}
                          />
                        </div>
                        {subShots.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-border/40 pl-3">
                            {subShots.map((sub, sIdx) => (
                              <div key={sub.id} className="p-2 rounded bg-background/50 border border-border/40 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-semibold text-muted-foreground">Subtoma {sIdx + 1}</span>
                                  <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-destructive" onClick={() => removeSubShot(index, sIdx)}>
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                                <input
                                  placeholder="Ángulo o acción (ej. Primer plano del rostro, reacción de pánico)"
                                  value={sub.visual}
                                  onChange={(e) => updateSubShot(index, sIdx, "visual", e.target.value)}
                                  className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                                />
                                <div className="grid grid-cols-2 gap-1.5">
                                  <select
                                    value={sub.speaker}
                                    onChange={(e) => updateSubShot(index, sIdx, "speaker", e.target.value)}
                                    className="rounded border border-border bg-background px-2 py-1 text-xs"
                                  >
                                    <option value="">Quién habla</option>
                                    {allAvailableSpeakers.map((name) => (
                                      <option key={name} value={name}>{name}</option>
                                    ))}
                                  </select>
                                  <input
                                    placeholder="Diálogo en esta toma"
                                    value={sub.dialogue}
                                    onChange={(e) => updateSubShot(index, sIdx, "dialogue", e.target.value)}
                                    className="rounded border border-border bg-background px-2 py-1 text-xs"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div className="flex gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => void handleSaveManualDraftOnly()}
                      disabled={generating || generatingVideos || savingDraft}
                    >
                      {savingDraft ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                      Guardar cambios del guion
                    </Button>
                  </div>
                </div>
              )}
            </Card>

            {/* PASO 4: ¡FILMAR MINISERIE! */}
            <Card className="p-8 border-2 border-primary/50 bg-gradient-to-b from-primary/10 via-card/80 to-card/90 shadow-xl rounded-2xl text-center space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary text-xs font-bold uppercase tracking-wider">
                <Clapperboard className="w-4 h-4" /> Paso 4: Rodaje Cinemático
              </div>
              <div className="space-y-1.5 max-w-xl mx-auto">
                <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  {chapterCount === 1 ? "Filmar Piloto de 2 Minutos (120s Multi-toma)" : `Filmar Miniserie de ${chapterCount} Capítulos`}
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  ComfyUI procesará la secuencia en tu tarjeta gráfica con rostros fijados (anclaje IP-Adapter), encuadres dinámicos continuos y voces neurales en español latino con sincronización labial.
                </p>
              </div>

              <div className="pt-2 max-w-md mx-auto">
                <Button
                  type="button"
                  size="lg"
                  className="w-full h-16 text-base sm:text-lg font-bold shadow-2xl bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center gap-3 rounded-xl transition-all transform hover:scale-[1.02]"
                  onClick={() => void handleManualSeries()}
                  disabled={generating || generatingVideos || draftingThree || savingDraft}
                >
                  {generatingVideos ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin mr-2" />
                      <span>{videoProgress || "Filmando con ComfyUI en tu PC..."}</span>
                    </>
                  ) : (
                    <>
                      <Clapperboard className="w-6 h-6 mr-2" />
                      <span>Iniciar Rodaje Cinemático (ComfyUI GPU)</span>
                    </>
                  )}
                </Button>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Al hacer clic, el rodaje inicia y pasarás automáticamente a la Sala de Rodaje en Vivo.
                </p>
              </div>
            </Card>

          </TabsContent>

          {/* VISTA 2: MONITOR DE RODAJE EN VIVO Y MIS SERIES UNIFICADAS */}
          <TabsContent value="filming" className="space-y-6 m-0 focus-visible:outline-none">

            {/* Header del Monitor */}

            <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl border border-border/80 bg-gradient-to-r from-card/80 via-card/50 to-muted/20 backdrop-blur-md shadow-sm">

              <div className="space-y-1">

                <div className="flex items-center gap-2.5">

                  <span className="p-2 rounded-xl bg-primary/10 text-primary">

                    <Clapperboard className="w-5 h-5" />

                  </span>

                  <div>

                    <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">

                      <span>Monitor de Rodaje Cinematográfico</span>

                      {(generatingVideos || (localJob && ["rendering", "queued", "video_review"].includes(localJob.state))) && (

                        <Badge className="bg-red-500 hover:bg-red-600 text-white font-semibold text-[10px] tracking-wide animate-pulse">

                          ● EN VIVO (GPU)

                        </Badge>

                      )}

                    </h2>

                    <p className="text-xs text-muted-foreground">

                      Visualiza en tiempo real cada toma procesada en tu tarjeta gráfica con Wan 2.1 y audio neural sincronizado.

                    </p>

                  </div>

                </div>

              </div>



              <div className="flex items-center gap-2">

                <Badge variant="outline" className={`text-xs py-1 px-2.5 flex items-center gap-1.5 ${

                  localHealth === "ready" ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/5" : "border-amber-500/40 text-amber-300 bg-amber-500/5"

                }`}>

                  <span className={`w-2 h-2 rounded-full ${localHealth === "ready" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />

                  <span>{localHealth === "ready" ? "ComfyUI Conectado (127.0.0.1:8188)" : "Modo Cloud"}</span>

                </Badge>

                <Button variant="outline" size="sm" onClick={() => setStudioTab("script")} className="text-xs gap-1.5 h-8">

                  <Sparkles className="w-3.5 h-3.5" /> Nuevo Guion

                </Button>

              </div>

            </div>



            {/* Panel Principal: Rodaje Activo o Tarjeta de Estado */}

            {localJob ? (

              <div className="space-y-6">

                {/* Tarjeta de Control y Progreso Activo */}

                <Card className="p-6 border-primary/30 bg-card/70 backdrop-blur-md shadow-md space-y-5">

                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">

                    <div>

                      <span className="text-[11px] font-bold uppercase tracking-wider text-primary">

                        {localJob.state === "completed" ? "Filmación Finalizada" : "Producción en Proceso"}

                      </span>

                      <h3 className="text-base font-bold text-foreground mt-0.5">

                        {manualTitle || novel?.title || "Miniserie Insomnia"}

                      </h3>

                    </div>

                    <Badge variant={localJob.state === "completed" ? "default" : "secondary"} className="text-xs font-mono">

                      {localJob.state === "rendering" ? `Toma ${localJob.current || 1} de ${localJob.total || chapterCount}`

                        : localJob.state === "references_ready" ? "Consistencia visual"

                        : localJob.state === "video_review" ? "Control de calidad"

                        : localJob.state === "failed" ? "Error"

                        : "Completado"}

                    </Badge>

                  </div>



                  {/* Barra de Progreso Dinámica */}

                  {localJob.state !== "failed" && (

                    <div className="space-y-2">

                      <div className="flex items-center justify-between text-xs font-semibold">

                        <span className="text-muted-foreground flex items-center gap-1.5">

                          {localJob.state === "rendering" && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}

                          {localJob.state === "rendering" ? `Filmando Capítulo ${localJob.current || 1} de ${localJob.total || chapterCount} en GPU...`

                            : localJob.state === "references_ready" ? "Generando consistencia de actores y planos..."

                            : localJob.state === "video_review" ? "Finalizando toma y ensamblando audio..."

                            : "¡Todos los capítulos han sido filmados!"}

                        </span>

                        <span className="text-primary font-mono text-sm">

                          {localJob.state === "completed" ? "100%"

                            : `${Math.min(95, Math.max(15, Math.round(((localJob.current ? (localJob.current - 1) + (localJob.videos?.length >= (localJob.current || 1) ? 0.9 : 0.4) : 0.2) / (localJob.total || chapterCount || 3)) * 100)))}%`}

                        </span>

                      </div>

                      <div className="w-full bg-muted/60 h-3 rounded-full overflow-hidden p-0.5 border border-border/40">

                        <div

                          className="bg-gradient-to-r from-primary to-accent h-full rounded-full transition-all duration-500 shadow-sm"

                          style={{

                            width: localJob.state === "completed" ? "100%"

                              : `${Math.min(95, Math.max(15, Math.round(((localJob.current ? (localJob.current - 1) + (localJob.videos?.length >= (localJob.current || 1) ? 0.9 : 0.4) : 0.2) / (localJob.total || chapterCount || 3)) * 100)))}%`

                          }}

                        />

                      </div>

                      <p className="text-[11px] text-muted-foreground/80 leading-relaxed pt-1">

                        {localJob.state === "rendering"

                          ? "ComfyUI está procesando los tensores de video cuadro por cuadro con Wan 2.1 (9:16 vertical) y sincronizando los diálogos. Los videos aparecerán automáticamente abajo apenas termine cada escena."

                          : localJob.state === "completed"

                            ? "Tus episodios están listos para reproducir, descargar en MP4 de alta fidelidad o publicar en el feed vertical de Shorts."

                            : "Procesando escena con tu GPU local..."}

                      </p>

                    </div>

                  )}



                  {/* Fallo si ocurre */}

                  {localJob.state === "failed" && (

                    <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive space-y-2">

                      <div className="flex items-center gap-2 font-semibold text-sm">

                        <AlertCircle className="w-4 h-4" />

                        <span>Kineva o ComfyUI reportaron un error</span>

                      </div>

                      <p className="text-xs text-destructive/90">{localJob.error || "No se pudo completar el rodaje."}</p>

                      <Button size="sm" variant="outline" className="mt-2 text-xs" onClick={() => setStudioTab("script")}>

                        Volver a Guion y Reintentar

                      </Button>

                    </div>

                  )}



                  {/* Referencias visuales cuando se procesan */}

                  {localJob.references && localJob.state === "references_ready" && (

                    <div className="pt-2">

                      <span className="text-xs font-semibold text-muted-foreground mb-2 block">Consistencia de personajes y escenario fijada:</span>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

                        {Object.entries(localJob.references).map(([key, url]) => (

                          <figure key={key} className="rounded-xl border border-border/80 overflow-hidden bg-background p-1.5 space-y-1.5">

                            <img src={localVideoSrc(url)} alt={key} className="w-full h-32 object-cover rounded-lg" />

                            <figcaption className="text-[11px] font-medium text-center text-muted-foreground capitalize">

                              {key === "primary" ? "Protagonista" : key === "secondary" ? "Coprotagonista" : "Locación"}

                            </figcaption>

                          </figure>

                        ))}

                      </div>

                    </div>

                  )}

                </Card>



                {/* Galería de Videos Filmados en Tiempo Real */}

                <div className="space-y-4">

                  <div className="flex items-center justify-between">

                    <h3 className="text-base font-bold text-foreground flex items-center gap-2">

                      <Film className="w-4 h-4 text-primary" />

                      <span>Capítulos Filmados ({localJob.videos?.length || 0} de {localJob.total || chapterCount})</span>

                    </h3>

                    {localJob.videos && localJob.videos.length > 0 && (

                      <Button size="sm" variant="ghost" onClick={() => { const el = document.getElementById("studio-production-catalog"); if (el) el.scrollIntoView({ behavior: "smooth" }); else setStudioTab("filming"); }} className="text-xs text-primary gap-1">

                        Ver en Catálogo General <Tv className="w-3.5 h-3.5" />

                      </Button>

                    )}

                  </div>



                  {(!localJob.videos || localJob.videos.length === 0) ? (

                    <div className="p-8 rounded-2xl border border-dashed border-border/80 text-center bg-card/30 space-y-3">

                      <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto opacity-70" />

                      <p className="text-sm font-medium text-foreground">Generando el primer capítulo en ComfyUI...</p>

                      <p className="text-xs text-muted-foreground max-w-md mx-auto">

                        Tan pronto como tu GPU termine de renderizar la toma actual, el reproductor de video aparecerá aquí automáticamente para ver y descargar.

                      </p>

                    </div>

                  ) : (

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">

                      {localJob.videos.map((video) => (

                        <Card key={video.url} className="overflow-hidden border-border/80 bg-card/60 backdrop-blur-sm space-y-3 p-3">

                          <div className="flex items-center justify-between pb-1">

                            <span className="text-xs font-bold text-primary uppercase tracking-wide">

                              Capítulo {video.episode}

                            </span>

                            <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10">

                              ✓ Filmado

                            </Badge>

                          </div>

                          <div className="relative aspect-[9/16] max-h-[380px] bg-black rounded-xl overflow-hidden mx-auto w-full shadow-inner">

                            <video controls className="w-full h-full object-contain" src={localVideoSrc(video.url)} />

                          </div>

                          <div className="flex flex-col gap-2 pt-1">

                            <Button

                              type="button"

                              variant="outline"

                              size="sm"

                              className="w-full text-xs font-semibold gap-1.5"

                              onClick={() => void downloadLocalChapter(video.url, video.episode)}

                            >

                              Descargar Video MP4

                            </Button>

                            {localJob.state === "completed" && seriesEpisodeIds[video.episode - 1] && (

                              <Button

                                type="button"

                                variant="secondary"

                                size="sm"

                                className="w-full text-xs font-medium"

                                onClick={() => {

                                  setShowManualEditor(true);

                                  setStudioTab("script");

                                }}

                              >

                                Editar escena y regenerar

                              </Button>

                            )}

                          </div>

                        </Card>

                      ))}

                    </div>

                  )}

                </div>

              </div>

            ) : (

              /* Estado en Espera cuando no hay rodaje activo */

              <Card className="p-12 text-center border-border/80 bg-card/40 backdrop-blur-md space-y-4 max-w-2xl mx-auto my-6">

                <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center">

                  <Clapperboard className="w-8 h-8" />

                </div>

                <h3 className="text-lg font-bold text-foreground">Monitor de Rodaje en Espera</h3>

                <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">

                  No hay ninguna filmación en curso en este momento. Diseña el guion de tu miniserie en la pestaña anterior y pulsa <strong className="text-foreground">"Iniciar Rodaje"</strong> para ver aquí el progreso en tiempo real de tu GPU.

                </p>

                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">

                  <Button onClick={() => setStudioTab("script")} className="text-xs font-semibold gap-2">

                    <Sparkles className="w-4 h-4" /> 1. Ir a Crear Guion & Reparto

                  </Button>

                  <Button variant="outline" onClick={() => { const el = document.getElementById("studio-production-catalog"); if (el) el.scrollIntoView({ behavior: "smooth" }); else setStudioTab("filming"); }} className="text-xs gap-2">

                    <Film className="w-4 h-4" /> Ver Mis Series Producidas

                  </Button>

                </div>

              </Card>

            )}

            {/* MIS SERIES PRODUCIDAS UNIFICADAS EN SALA DE RODAJE */}
            <div id="studio-production-catalog" className="pt-8 border-t border-border/80 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-xl bg-primary/10 text-primary">
                    <Film className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">Mis Series Producidas</h3>
                    <p className="text-xs text-muted-foreground">Catálogo de capítulos y series completadas en tu estudio.</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setStudioTab("script")}
                  className="text-xs gap-1.5 h-8 font-semibold"
                >
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  Crear Nueva Miniserie
                </Button>
              </div>
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

              setStudioTab("script");

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
            </div>
          </TabsContent>
        </Tabs>

</div>

    </MainLayout>

  );

};



export default Studio;

