import { useState } from "react";
import { Clapperboard, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
  const [videoProvider, setVideoProvider] = useState<"gateway" | "kineva">("gateway");
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [creativity, setCreativity] = useState("balanced");
  const [description, setDescription] = useState("");
  const [chapterCount, setChapterCount] = useState(7);
  const [isSafeForWork, setIsSafeForWork] = useState(false);
  const [language, setLanguage] = useState("English");
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatingVideos, setGeneratingVideos] = useState(false);
  const [videoProgress, setVideoProgress] = useState("");
  const [novel, setNovel] = useState<any>(null);

 
  const creativityLevels = [
    { value: "conservative", label: t("studio.creativity.conservative") },
    { value: "balanced", label: t("studio.creativity.balanced") },
    { value: "creative", label: t("studio.creativity.creative") },
    { value: "wild", label: t("studio.creativity.wild") },
  ];

  const createVideosForNovel = async (generated: any) => {
    const chapters = generated?.chapters ?? [];
    if (chapters.length === 0) throw new Error("La novela no contiene capítulos para convertir en videos");
    if (videoProvider === "kineva") {
      const oversized = chapters.find((chapter: { content?: string }) =>
        ((chapter.content ?? "").trim().match(/\S+/gu) ?? []).length > 384);
      if (oversized) throw new Error("Un capítulo supera las 384 palabras permitidas para esta vista previa de Kineva. Genera capítulos más breves antes de crear la serie.");
    }

    setGeneratingVideos(true);
    setVideoProgress("Creando la serie de Shorts…");

    let referencePath: string | null = null;
    if (videoProvider === "kineva") {
      if (!referenceImage || !user) throw new Error("Kineva necesita una imagen de referencia para mantener la identidad visual");
      const ext = referenceImage.name.split(".").pop()?.toLowerCase();
      if (!ext || !["png", "jpg", "jpeg", "webp"].includes(ext) || referenceImage.size > 10_000_000) {
        throw new Error("Usa una imagen PNG, JPEG o WebP de hasta 10 MB");
      }
      referencePath = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("kineva-references").upload(referencePath, referenceImage, { upsert: false });
      if (uploadError) throw uploadError;
    }

    const { data: series, error: seriesError } = await supabase
      .from("shorts_series")
      .insert({
        video_provider: videoProvider,
        kineva_reference_image_path: referencePath,
        kineva_bible: videoProvider === "kineva" ? {
          characters: generated.characters ?? [], setting: generated.setting ?? {}, language,
        } : {},
        title: generated.title || "Serie sin título",
        premise: generated.logline || description || null,
        category: "romance",
        is_adult: !isSafeForWork,
        created_by: user?.id,
        is_published: true,
      })
      .select()
      .single();
    if (seriesError || !series) {
      throw new Error(seriesError?.message || "No se pudo crear la serie de Shorts");
    }

    const episodesPayload = chapters.map((chapter: any, index: number) => ({
      series_id: series.id,
      episode_number: chapter.number ?? index + 1,
      title: chapter.title || `Capítulo ${index + 1}`,
      script: chapter.content ?? "",
      video_prompt: `${chapter.video_prompt || chapter.content?.slice(0, 500) || ""}. Spoken dialogue and narration must be in ${language}. Tell the story through voices and actions only; never show captions, subtitles, narration, dialogue, or story text on screen.`,
      status: "pending",
    }));

    const { data: episodes, error: episodesError } = await supabase
      .from("shorts_episodes")
      .insert(episodesPayload)
      .select();
    if (episodesError || !episodes) {
      throw new Error(episodesError?.message || "No se pudieron crear los episodios");
    }

    let started = 0;
    const episodesToStart = videoProvider === "kineva" ? episodes.slice(0, 1) : episodes;
    for (let index = 0; index < episodesToStart.length; index += 1) {
      setVideoProgress(`Iniciando video ${index + 1} de ${episodes.length}…`);
      const functionName = videoProvider === "kineva" ? "kineva-video" : "shorts-video";
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { action: "create", episodeId: episodesToStart[index].id },
      });
      if (!error && !data?.error) started += 1;
    }

    if (started === 0) throw new Error("La serie fue creada, pero el generador no pudo iniciar los videos");

    toast({
      title: "Proyecto y videos creados",
      description: videoProvider === "kineva"
        ? "Primera entrega en cola; las demás quedan listas para iniciar en Shorts."
        : `${started} de ${episodes.length} videos se están generando en la pestaña Shorts.`,
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

    setGenerating(true);
    setNovel(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-novel", {
        body: {
          description,
          chapterCount,
          language,
          creativity,
          isSafeForWork,
          videoProvider,
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);

      const generated = data.novel;
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

      await createVideosForNovel(generated);
    } catch (e) {
      toast({
        title: "No se pudo generar el proyecto",
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
    const chapters = novel?.chapters ?? [];
    if (!novel || chapters.length === 0) {
      toast({ title: "Primero genera el proyecto completo con IA", variant: "destructive" });
      return;
    }

    try {
      await createVideosForNovel(novel);
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
    toast({ title: t("studio.toast.loaded") });
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
       <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-display text-center mb-8">{t("studio.title")}</h1>
 
         {/* AI Settings */}
         <Card className="p-6 mb-6 space-y-2">
           <Label>Motor de video</Label>
           <Select value={videoProvider} onValueChange={(v) => setVideoProvider(v as "gateway" | "kineva")}>
             <SelectTrigger><SelectValue /></SelectTrigger>
             <SelectContent>
               <SelectItem value="gateway">Generador actual</SelectItem>
                {import.meta.env.VITE_KINEVA_ENABLED === "true" && (
               <SelectItem value="kineva">Kineva local · miniseries</SelectItem>
                )}
             </SelectContent>
           </Select>
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
 
         {videoProvider === "kineva" && (
          <Card className="p-6 mb-6 space-y-3">
            <Label htmlFor="kineva-reference">Referencia visual para toda la miniserie</Label>
            <input id="kineva-reference" type="file" accept="image/png,image/jpeg,image/webp"
              onChange={(event) => setReferenceImage(event.target.files?.[0] ?? null)}
              className="block w-full text-sm" />
            <p className="text-xs text-muted-foreground">
              Kineva usa esta imagen para los personajes y el escenario. El render requiere el trabajador local activo.
            </p>
          </Card>
        )}

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

        {novel && (
          <Card className="p-6 mb-6 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
              <h2 className="font-display text-2xl">{novel.title}</h2>
              {novel.logline && (
                <p className="text-sm text-muted-foreground mt-1">{novel.logline}</p>
              )}
              </div>
              <Link to="/shorts">
                <Button variant="outline" className="rounded-none">Ver en Shorts</Button>
              </Link>
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
                  <Clapperboard className="w-5 h-5 mr-2" /> Generar videos capítulo por capítulo
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Crea una serie en la pestaña Shorts con un episodio de video por capítulo, manteniendo la identidad de los personajes.
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
