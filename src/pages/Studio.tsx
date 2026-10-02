import { invokeFunctionWithRetry } from "@/lib/invokeFunction";
import { generateSceneImage } from "@/lib/sceneImage";
import {
  createLocalJob,
  encodeLocalImage,
  fetchLocalJob,
  localVideoSrc,
  probeLocalKineva,
  type LocalJob,
  type LocalProbe,
  type LocalStudioStatus,
} from "@/lib/kinevaLocal";
import { useEffect, useState } from "react";
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

const chapterOptions = [3, 5, 7, 10, 15, 20];

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
  const [localEpisodes, setLocalEpisodes] = useState(1);
  const [localHealth, setLocalHealth] = useState<LocalStudioStatus>("missing-worker");
  const [localJob, setLocalJob] = useState<LocalJob | null>(null);
  const [creativity, setCreativity] = useState("balanced");
  const [description, setDescription] = useState("");
  const [chapterCount, setChapterCount] = useState(7);
  const [isSafeForWork, setIsSafeForWork] = useState(false);
  const [language, setLanguage] = useState("Spanish");
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [shelf, setShelf] = useState(true);
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

  const createVideosForNovel = async (generated: any, pendingProbe?: Promise<LocalProbe>) => {
    const probe = await (pendingProbe ?? probeLocalKineva());
    setLocalHealth(probe.status);
    if (probe.status === "missing-comfy") {
      throw new Error("Falta ComfyUI en esta PC (127.0.0.1:8188).");
    }
    if (probe.status === "missing-template") {
      throw new Error("Falta la plantilla de Kineva en esta PC.");
    }
    const idea = String(description || generated?.logline || generated?.title || "").trim();
    setGeneratingVideos(true);
    setVideoProgress("Encolando el video en esta PC…");
    const image = referenceImage ? await encodeLocalImage(referenceImage) : null;
    const job = await createLocalJob({ idea, image, episodes: localEpisodes });
    setLocalJob(job);
    toast({
      title: "Video en cola en esta PC",
      description: `${job.total} episodio${job.total === 1 ? "" : "s"} con ComfyUI local.`,
    });
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
    } catch (e) {
      toast({
        title: "La novela en la nube no se generó",
        description: e instanceof Error ? e.message : "El video local se encola igual.",
        variant: "destructive",
      });
    }
    try {
      await createVideosForNovel(generated, loopbackProbe);
    } catch (e) {
      toast({
        title: "No se pudo encolar el video en esta PC",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
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
      await createVideosForNovel(novel, loopbackProbe);
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
     setShelf(false);
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

        {shelf ? (
        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl">Tus novelas</h2>
              <p className="text-xs text-muted-foreground">Cada novela es una portada. Entra para ver los capítulos.</p>
            </div>
            <Button className="rounded-none" onClick={() => { setNovel(null); setCurrentProjectId(null); setShelf(false); }}>
              <Sparkles className="mr-2 h-4 w-4" /> Nueva novela
            </Button>
          </div>
          {projectsLoading ? (
            <p className="text-sm text-muted-foreground">Cargando proyectos…</p>
          ) : !projects?.length ? (
            <p className="text-sm text-muted-foreground">Todavía no hay novelas guardadas. Crea una y los capítulos quedan dentro de su portada.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {projects.map((project, index) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => handleLoadProject(project)}
                  className="overflow-hidden border border-border/60 bg-card text-left transition-all hover:-translate-y-1 hover:border-primary/60"
                >
                  <div className="relative flex aspect-[4/5] items-end bg-gradient-to-br from-primary/30 via-background to-accent/20 p-4">
                    <p className="font-display text-xl leading-tight">{project.title}</p>
                    <span className="absolute bottom-0 right-0 border-l border-t border-border/60 bg-background/80 px-2 py-1 font-display text-xs italic text-accent">N°{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <div className="space-y-1 p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-accent">{project.chapter_count} capítulos</p>
                    {!project.content && <p className="text-xs text-amber-500">Falta el texto de los capítulos.</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
        ) : (
        <>
        <button type="button" onClick={() => setShelf(true)} className="mb-6 text-xs uppercase tracking-[0.2em] text-accent">Volver a las novelas</button>

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
            <Label htmlFor="kineva-reference">Imagen inicial (opcional)</Label>
            <input id="kineva-reference" type="file" accept="image/png,image/jpeg,image/webp"
              onChange={(event) => setReferenceImage(event.target.files?.[0] ?? null)}
              className="block w-full text-sm" />
            <div className="space-y-2">
              <Label>Episodios en esta PC</Label>
              <Select value={String(localEpisodes)} onValueChange={(value) => setLocalEpisodes(Number(value))}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 episodio</SelectItem>
                  <SelectItem value="2">2 episodios</SelectItem>
                  <SelectItem value="3">3 episodios</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Sube una foto para conservar su identidad o deja este campo vacío. El video se crea en ComfyUI de esta PC, no en la nube.
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
          disabled={generating}
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
                : localJob.state === "rendering" ? `Creando video ${localJob.current} de ${localJob.total}…`
                : localJob.state === "failed" ? `Error: ${localJob.error || "Kineva no pudo crear el video."}`
                : "Video listo."}
            </p>
            {localJob.videos?.map((video) => (
              <div key={video.url}>
                <h3 className="text-sm font-medium">Episodio {video.episode}</h3>
                <video controls className="mt-2 w-full rounded-md" src={localVideoSrc(video.url)} />
              </div>
            ))}
          </Card>
        )}

        {novel && (
          <Card className="p-6 mb-6 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
              <h2 className="font-display text-2xl">{novel.title}</h2>
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
                    {chapterImages[i] ? "Recrear imagen" : "Ilustrar capÃ­tulo"}
                  </Button>
                  {chapterImages[i] && <img src={chapterImages[i]} alt={"Escena del capÃ­tulo " + (i + 1)}
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
                  <Clapperboard className="w-5 h-5 mr-2" /> Crear video con ComfyUI en esta PC
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              El video se encola en ComfyUI de esta PC: tu idea, una imagen opcional y de 1 a 3 episodios.
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
        </>
        )}
       </div>
     </MainLayout>
   );
 };

 export default Studio;
