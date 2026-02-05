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
 
 const creativityLevels = [
   { value: "conservative", label: "Conservative" },
   { value: "balanced", label: "Balanced" },
   { value: "creative", label: "Creative" },
   { value: "wild", label: "Wild" },
 ];
 
 const languages = [
   "English", "Spanish", "French", "German", "Italian", 
   "Portuguese", "Japanese", "Korean", "Chinese"
 ];
 
 const chapterOptions = [3, 5, 7, 10, 15, 20];
 
 const Studio = () => {
   const { user } = useAuth();
   const { toast } = useToast();
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
 
   const handleWriteNovel = async () => {
     if (!user) {
       toast({ title: "Please login to create novels", variant: "destructive" });
       return;
     }
     
     toast({ 
       title: "Generating novel...", 
       description: "This may take a few moments" 
     });
     
     // Simulate novel generation
     setTimeout(() => {
       toast({ title: "Novel generated!", description: "Your novel has been created" });
     }, 2000);
   };
 
   const handleWriteOutline = () => {
     toast({ title: "Generating outline...", description: "Creating chapter structure" });
   };
 
   const handleBlankNovel = () => {
     setDescription("");
     setCurrentProjectId(null);
     toast({ title: "New blank novel created" });
   };
 
   const handleSaveProject = async () => {
     if (!user) {
       toast({ title: "Please login to save projects", variant: "destructive" });
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
         toast({ title: "Project saved!" });
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
         toast({ title: "Project created!" });
       }
     } catch (error) {
       toast({ title: "Error saving project", variant: "destructive" });
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
     toast({ title: "Project loaded" });
   };
 
   const handleDeleteProjects = async () => {
     if (projects) {
       for (const project of projects) {
         await deleteProject.mutateAsync(project.id);
       }
       toast({ title: "All projects deleted" });
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
     toast({ title: "Settings reset" });
   };
 
   if (!user) {
     return (
       <MainLayout>
         <div className="container mx-auto px-4 py-16 text-center">
           <h1 className="text-3xl font-display mb-4">Novel Studio</h1>
           <p className="text-muted-foreground mb-6">Please log in to use the Novel Studio</p>
           <Link to="/login">
             <Button>Login</Button>
           </Link>
         </div>
       </MainLayout>
     );
   }
 
   return (
     <MainLayout>
       <div className="container mx-auto px-4 py-8 max-w-4xl">
         <h1 className="text-3xl font-display text-center mb-8">Novel Studio</h1>
 
         {/* AI Settings */}
         <Card className="p-6 mb-6">
           <h2 className="text-lg font-medium text-center mb-6">AI</h2>
           
           <div className="grid grid-cols-2 gap-6">
             <div className="space-y-2">
               <Label>Model:</Label>
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
               <Label>Creativity:</Label>
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
           <h2 className="text-lg font-medium text-center mb-4">Description</h2>
           <Textarea
             placeholder="Two women and a man explore ..."
             value={description}
             onChange={(e) => setDescription(e.target.value)}
             className="min-h-[200px] resize-none"
           />
 
           <div className="flex flex-wrap items-center justify-between gap-4 mt-4">
             <div className="flex items-center gap-4">
               <div className="flex items-center gap-2">
                 <Label>Number of Chapters:</Label>
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
                 <Label>Safe for Work</Label>
               </div>
             </div>
 
             <div className="flex items-center gap-2">
               <Label>Language:</Label>
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
           <Button onClick={handleWriteNovel}>Write Novel</Button>
           <Button onClick={handleWriteOutline}>Write Outline</Button>
           <Button onClick={handleBlankNovel}>Blank Novel</Button>
         </div>
 
         {/* Project Management */}
         <div className="grid grid-cols-3 gap-4 mb-4">
           <Button variant="secondary" onClick={handleSaveProject}>
             Save Project
           </Button>
           <AlertDialog>
             <AlertDialogTrigger asChild>
               <Button variant="secondary">Load Project</Button>
             </AlertDialogTrigger>
             <AlertDialogContent>
               <AlertDialogHeader>
                 <AlertDialogTitle>Load Project</AlertDialogTitle>
                 <AlertDialogDescription>
                   {projectsLoading ? (
                     "Loading projects..."
                   ) : projects?.length === 0 ? (
                     "No saved projects found"
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
                 <AlertDialogCancel>Cancel</AlertDialogCancel>
               </AlertDialogFooter>
             </AlertDialogContent>
           </AlertDialog>
           <AlertDialog>
             <AlertDialogTrigger asChild>
               <Button variant="secondary">Delete Projects</Button>
             </AlertDialogTrigger>
             <AlertDialogContent>
               <AlertDialogHeader>
                 <AlertDialogTitle>Delete All Projects?</AlertDialogTitle>
                 <AlertDialogDescription>
                   This action cannot be undone. All your saved projects will be permanently deleted.
                 </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                 <AlertDialogCancel>Cancel</AlertDialogCancel>
                 <AlertDialogAction onClick={handleDeleteProjects}>Delete</AlertDialogAction>
               </AlertDialogFooter>
             </AlertDialogContent>
           </AlertDialog>
         </div>
 
         <div className="grid grid-cols-3 gap-4">
           <Button variant="outline">Download Project</Button>
           <Button variant="outline">Upload Project</Button>
           <Button variant="outline" onClick={handleReset}>Reset</Button>
         </div>
       </div>
     </MainLayout>
   );
 };
 
 export default Studio;