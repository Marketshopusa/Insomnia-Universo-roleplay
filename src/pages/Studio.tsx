 import { useState } from "react";
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
   const [creativity, setCreativity] = useState("balanced");
   const [description, setDescription] = useState("");
   const [chapterCount, setChapterCount] = useState(7);
   const [isSafeForWork, setIsSafeForWork] = useState(false);
   const [language, setLanguage] = useState("English");
   const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
 
  const creativityLevels = [
    { value: "conservative", label: t("studio.creativity.conservative") },
    { value: "balanced", label: t("studio.creativity.balanced") },
    { value: "creative", label: t("studio.creativity.creative") },
    { value: "wild", label: t("studio.creativity.wild") },
  ];

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

      toast({ title: "Proyecto generado y guardado", description: generated.title });
    } catch (e) {
      toast({
        title: "No se pudo generar el proyecto",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
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
 
         {/* Action Buttons */}
         <div className="grid grid-cols-3 gap-4 mb-6">
          <Button onClick={handleWriteNovel}>{t("studio.writeNovel")}</Button>
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