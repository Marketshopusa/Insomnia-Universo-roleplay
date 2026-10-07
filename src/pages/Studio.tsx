import { invokeFunctionWithRetry } from "@/lib/invokeFunction";
import { generateSceneImage } from "@/lib/sceneImage";
import { publishLocalChapters } from "@/lib/chapterVideo";
import { uploadKinevaReference } from "@/lib/kinevaReference";
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
  type LocalJob,
  type LocalProbe,
  type LocalStudioStatus,
} from "@/lib/kinevaLocal";
import { useEffect, useRef, useState } from "react";
import { Clapperboard, Loader2, Sparkles } from "lucide-react";

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
  { value: "apprentice-6", label: "Apprentice 6 (♦)" },
  { value: "master-pro", label: "Master Pro (♦♦)" },
  { value: "sage-elite", label: "Sage Elite (♦♦♦)" },
];

const languages = [
  "English", "Spanish", "French", "German", "Italian",
  "Portuguese", "Japanese", "Korean", "Chinese"
];

const chapterOptions = [3, 5, 7, 10, 12];

 const Studio = () => {
   const { user } = useAuth();
   const { toast } = useToast();
  const { t } = useLanguage();
   const { data: projects, isLoading: projectsLoading } = useNovelProjects();
   const createProject = useCreateNovelProject();
   const updateProject = useUpdateNovelProject();
   const deleteProject = useDeleteNovelProject();

  const [model, setModel] = useState("apprentice-6");
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [primaryName, setPrimaryName] = useState("");
  const [secondaryName, setSecondaryName] = useState("");
  const [secondaryImage, setSecondaryImage] = useState<File | null>(null);
  const [locationName, setLocationName] = useState("");
  const [locationDescription, setLocationDescription] = useState("");
  const [locationImage, setLocationImage] = useState<File | null>(null);
  const [seriesEpisodeIds, setSeriesEpisodeIds] = useState<string[]>([]);
  const [savedSeriesId, setSavedSeriesId] = useState<string | null>(null);
  const [localHealth, setLocalHealth] = useState<LocalStudioStatus>("missing-worker");
  const [localJob, setLocalJob] = useState<LocalJob | null>(null);
  const [creativity, setCreativity] = useState("balanced");
  const [description, setDescription] = useState("");
  const [chapterCount, setChapterCount] = useState(7);
  const [isSafeForWork, setIsSafeForWork] = useState(false);
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
  useEffect(() => {
    if (loadedFromUrl.current || !projects?.length) return;
    const id = new URLSearchParams(window.location.search).get("project");
    if (!id) return;
    const project = projects.find((item) => item.id === id);
    if (!project) return;
    loadedFromUrl.current = true;
    handleLoadProject(project);
  }, [projects]);

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
  };

  const filmChapters = async (chapters: string[], episodeIds: string[], pendingProbe?: Promise<LocalProbe>, dialogues: string[] = [], storyPlan?: any, existingJob?: LocalJob) => {
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
    const cast = {
      primary_name: primaryName.trim() || String(first.name || "").slice(0, 80),
      primary_description: image ? "" : String(first.visual_prompt || [first.appearance, first.wardrobe].filter(Boolean).join(". ")).slice(0, 500),
      secondary_name: secondaryName.trim() || (secondaryImage ? "" : String(second.name || "").slice(0, 80)),
      secondary_description: secondaryImage ? "" : String(second.visual_prompt || [second.appearance, second.wardrobe].filter(Boolean).join(". ")).slice(0, 500),
      secondary_image: secondaryImage ? await encodeLocalImage(secondaryImage) : null,
      location_name: locationName.trim() || String(setting.place || "").slice(0, 80),
      location_description: locationDescription.trim() || String([setting.place, setting.time, setting.visual_style].filter(Boolean).join(". ")).slice(0, 500),
      location_image: locationImage ? await encodeLocalImage(locationImage) : null,
    };
    const shotPlans = (storyPlan?.chapters || []).map((chapter: any, index: number) => {
      const plans = Array.isArray(chapter.shots) ? chapter.shots.slice(0, 3).map((shot: any) => ({
        visual: String(shot.visual || "").trim(), dialogue: String(shot.dialogue || "").trim(),
      })).filter((shot: { visual: string }) => shot.visual.length >= 5) : [];
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
      toast({ title: "Escenas aprobadas", description: "Se guardaron los videos revisados en la serie." });
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

  const handleGenerateProject = async () => {
    if (!user) {
      toast({ title: t("studio.toast.loginToCreate"), variant: "destructive" });
      return;
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
      toast({
        title: "Novela guardada capítulo por capítulo",
        description: isSafeForWork
          ? "Está en Series. Abre la portada para leer cada capítulo."
          : "Está en Series. Si no la ves en la parrilla, activa el modo 18+ o ábrela desde el enlace de la portada.",
      });
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
    try {
      await filmChapters(chapterTexts, episodeIds, loopbackProbe, chapterScenes.map((scene: { dialogue: string }) => scene.dialogue), generated);
    } catch (e) {
      toast({
        title: "La novela está guardada, el video no",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setGeneratingVideos(false);
      setVideoProgress("");
    }
  };

  const handleGenerateVideos = async () => {
    if (!user) {
      toast({ title: t("studio.toast.loginToCreate"), variant: "destructive" });
      return;
    }
    if (description.trim().length < 5 && !novel?.logline) {
      toast({ title: "Escribe la idea del video", variant: "destructive" });
      return;
    }

    const loopbackProbe = probeLocalKineva();
    try {
      let episodeIds = seriesEpisodeIds;
      const scenes = (novel?.chapters ?? [])
        .map((chapter: { video_prompt?: string; summary?: string; content?: string; spoken_line?: string }) => ({
          visual: String(chapter.video_prompt || chapter.summary || chapter.content || "").trim(),
          dialogue: String(chapter.spoken_line || "").trim(),
        })).filter((scene: { visual: string }) => scene.visual.length >= 5);
      const chapterTexts = scenes.map((scene: { visual: string }) => scene.visual);
      if (!episodeIds.length && novel) {
        const savedSeries = await saveNovelSeries({
          userId: user.id,
          novel,
          description,
          isAdult: !isSafeForWork,
        });
        episodeIds = savedSeries.episodeIds;
        setSeriesEpisodeIds(episodeIds);
        setSavedSeriesId(savedSeries.seriesId);
      }
      await filmChapters(chapterTexts.length ? chapterTexts : [String(description || novel?.logline || "")], episodeIds, loopbackProbe, scenes.map((scene: { dialogue: string }) => scene.dialogue), novel);
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
       for (const project of projects) {
         await deleteProject.mutateAsync(project.id);
       }
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
     setLanguage("English");
     setCurrentProjectId(null);
    toast({ title: t("studio.toast.reset") });
   };

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
         </Card>

          <Card className="p-6 mb-6 space-y-3">
            <Label htmlFor="kineva-reference">Personaje principal: foto de referencia (opcional)</Label>
            <input id="kineva-reference" type="file" accept="image/png,image/jpeg,image/webp"
              onChange={(event) => setReferenceImage(event.target.files?.[0] ?? null)}
              className="block w-full text-sm" />
            <input aria-label="Nombre del personaje principal" placeholder="Nombre del personaje principal" value={primaryName}
              onChange={(event) => setPrimaryName(event.target.value)} maxLength={80}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            <Label htmlFor="kineva-second">Segundo personaje: foto separada</Label>
            <input id="kineva-second" type="file" accept="image/png,image/jpeg,image/webp"
              onChange={(event) => setSecondaryImage(event.target.files?.[0] ?? null)} className="block w-full text-sm" />
            <input aria-label="Nombre del segundo personaje" placeholder="Nombre del segundo personaje" value={secondaryName}
              onChange={(event) => setSecondaryName(event.target.value)} maxLength={80}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            <Label htmlFor="kineva-location">Lugar: foto separada (opcional)</Label>
            <input id="kineva-location" type="file" accept="image/png,image/jpeg,image/webp"
              onChange={(event) => setLocationImage(event.target.files?.[0] ?? null)} className="block w-full text-sm" />
            <input aria-label="Nombre del lugar" placeholder="Nombre del lugar" value={locationName}
              onChange={(event) => setLocationName(event.target.value)} maxLength={80}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            <input aria-label="Descripción del lugar" placeholder="Descripción del lugar y su iluminación" value={locationDescription}
              onChange={(event) => setLocationDescription(event.target.value)} maxLength={400}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            <p className="text-xs text-muted-foreground">
              Estas referencias se envían a Kineva en esta PC para mantener personajes y lugar separados entre capítulos.
            </p>
          </Card>

        {/* Description */}
         <Card className="p-6 mb-6">
          <h2 className="text-lg font-medium text-center mb-4">{t("studio.description")}</h2>
           <Textarea
            placeholder={t("studio.descriptionPlaceholder")}
             value={description}
             onChange={(e) => setDescription(e.target.value)}
             className="min-h-[200px] resize-none"
           />

           <div className="flex flex-wrap items-center justify-between gap-4 mt-4">
             <div className="flex items-center gap-4">
               <div className="flex items-center gap-2">
                <Label>{t("studio.numChapters")}:</Label>
                 <Select value={chapterCount.toString()} onValueChange={(v) => setChapterCount(parseInt(v))}>
                   <SelectTrigger className="w-20">
                     <SelectValue />
                   </SelectTrigger>
                   <SelectContent>
                     {chapterOptions.map((num) => (
                       <SelectItem key={num} value={num.toString()}>
                         {num}
                       </SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
               </div>

               <div className="flex items-center gap-2">
                 <Switch checked={isSafeForWork} onCheckedChange={setIsSafeForWork} />
                <Label>{t("studio.safeForWork")}</Label>
               </div>
             </div>

             <div className="flex items-center gap-2">
              <Label>{t("studio.language")}:</Label>
               <Select value={language} onValueChange={setLanguage}>
                 <SelectTrigger className="w-32">
                   <SelectValue />
                 </SelectTrigger>
                 <SelectContent>
                   {languages.map((lang) => (
                     <SelectItem key={lang} value={lang}>
                       {lang}
                     </SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>
           </div>
         </Card>

        {/* Generar proyecto completo */}
        <Button
          size="lg"
          className="w-full mb-6 h-14 text-base rounded-none"
          onClick={handleGenerateProject}
          disabled={generating || generatingVideos}
        >
          {generating ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Generando novela completa…
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 mr-2" /> Generar proyecto y videos con IA
            </>
          )}
        </Button>

        {localJob && (
          <Card className="p-6 mb-6 space-y-4">
            <h2 className="text-lg font-medium">Video en esta PC</h2>
            <p role="status">
              {localJob.state === "queued" ? "En cola…"
                : localJob.state === "references_ready" ? "Revisa las referencias antes de generar el video."
                : localJob.state === "video_review" ? "Revisa la toma. Solo se guardará al aprobarla."
                : localJob.state === "rendering" ? `Creando video ${localJob.current} de ${localJob.total}…`
                : localJob.state === "failed" ? `Error: ${localJob.error || "Kineva no pudo crear el video."}`
                : "Escenas listas para revisión."}
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
                <p className="text-sm text-amber-600">Revisa rostros, manos, movimiento y acción antes de aprobar.</p>
              </div>
            )}
            {localJob.videos?.map((video) => (
              <div key={video.url}>
                <h3 className="text-sm font-medium">Escena del capítulo {video.episode}</h3>
                <video controls className="mt-2 w-full rounded-md" src={localVideoSrc(video.url)} />
                {video.approved === false && <p className="text-sm text-amber-600">Pendiente de aprobación visual</p>}
              </div>
            ))}
            {["references_ready", "video_review"].includes(localJob.state) && (
              <div className="flex gap-3">
                <Button onClick={() => void handleLocalReview(true)}>Aprobar y continuar</Button>
                <Button variant="secondary" onClick={() => void handleLocalReview(false)}>Rechazar</Button>
              </div>
            )}
          </Card>
        )}

        {novel && (
          <Card className="p-6 mb-6 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
              <h2 className="font-display text-2xl">{novel.title}</h2>
              {savedSeriesId && (
                <Link to={"/shorts/" + savedSeriesId} className="mt-2 inline-block text-xs uppercase tracking-[0.16em] text-accent">
                  Abrir esta novela en Series
                </Link>
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

            <div className="space-y-4">
              <h3 className="text-sm uppercase tracking-[0.2em] text-accent">Capítulos</h3>
              {(novel.chapters ?? []).map((ch: any, i: number) => (
                <div key={i} className="border border-border p-4 space-y-2">
                  <p className="font-display text-lg">
                    {ch.number}. {ch.title}
                  </p>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{ch.content}</p>
                  <Button variant="secondary" size="sm" disabled={illustratingChapter !== null}
                    onClick={() => illustrateChapter(ch, i)}>
                    {illustratingChapter === i ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                    {chapterImages[i] ? "Recrear imagen" : "Ilustrar capítulo"}
                  </Button>
                  {chapterImages[i] && <img src={chapterImages[i]} alt={"Escena del capítulo " + (i + 1)}
                    className="w-full max-w-md rounded-md" />}

                  {ch.video_prompt && (
                    <p className="text-xs font-mono text-muted-foreground break-words border-t border-border pt-2">
                      Video prompt: {ch.video_prompt}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <Button
              size="lg"
              className="w-full h-14 text-base rounded-none"
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
            <p className="text-xs text-muted-foreground text-center">
              ComfyUI filma el texto de cada capítulo y el video queda guardado dentro de la novela.
            </p>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Button variant="secondary" onClick={handleGenerateProject} disabled={generating}>
            {t("studio.writeNovel")}
          </Button>
          <Button onClick={handleWriteOutline}>{t("studio.writeOutline")}</Button>
          <Button onClick={handleBlankNovel}>{t("studio.blankNovel")}</Button>
         </div>

         {/* Project Management */}
         <div className="grid grid-cols-3 gap-4 mb-4">
           <Button variant="secondary" onClick={handleSaveProject}>
            {t("studio.saveProject")}
           </Button>
           <AlertDialog>
             <AlertDialogTrigger asChild>
              <Button variant="secondary">{t("studio.loadProject")}</Button>
             </AlertDialogTrigger>
             <AlertDialogContent>
               <AlertDialogHeader>
                <AlertDialogTitle>{t("studio.loadProject")}</AlertDialogTitle>
                 <AlertDialogDescription>
                   {projectsLoading ? (
                    t("studio.loadingProjects")
                   ) : projects?.length === 0 ? (
                    t("studio.noSavedProjects")
                   ) : (
                     <div className="space-y-2 mt-4">
                       {projects?.map((project) => (
                         <Button
                           key={project.id}
                           variant="outline"
                           className="w-full justify-start"
                           onClick={() => handleLoadProject(project)}
                         >
                           {project.title}
                         </Button>
                       ))}
                     </div>
                   )}
                 </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
               </AlertDialogFooter>
             </AlertDialogContent>
           </AlertDialog>
           <AlertDialog>
             <AlertDialogTrigger asChild>
              <Button variant="secondary">{t("studio.deleteProjects")}</Button>
             </AlertDialogTrigger>
             <AlertDialogContent>
               <AlertDialogHeader>
                <AlertDialogTitle>{t("studio.deleteAllTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("studio.deleteAllDesc")}</AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteProjects}>{t("common.delete")}</AlertDialogAction>
               </AlertDialogFooter>
             </AlertDialogContent>
           </AlertDialog>
         </div>

         <div className="grid grid-cols-3 gap-4">
          <Button variant="outline">{t("studio.downloadProject")}</Button>
          <Button variant="outline">{t("studio.uploadProject")}</Button>
          <Button variant="outline" onClick={handleReset}>{t("studio.reset")}</Button>
         </div>
       </div>
     </MainLayout>
   );
 };

 export default Studio;
