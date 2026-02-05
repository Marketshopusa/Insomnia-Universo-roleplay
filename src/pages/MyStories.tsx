 import { useState } from "react";
 import { MainLayout } from "@/components/layout/MainLayout";
 import { Button } from "@/components/ui/button";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Input } from "@/components/ui/input";
 import { Textarea } from "@/components/ui/textarea";
 import { useAuth } from "@/contexts/AuthContext";
 import { useUserStories, useCreateUserStory, useUpdateUserStory, useDeleteUserStory } from "@/hooks/useUserStories";
 import { useToast } from "@/hooks/use-toast";
 import { Link } from "react-router-dom";
 import { Trash2, Edit, Plus, X, Save } from "lucide-react";
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
   DialogTrigger,
 } from "@/components/ui/dialog";
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
 import { format } from "date-fns";
 
 const MyStories = () => {
   const { user } = useAuth();
   const { toast } = useToast();
   const { data: stories, isLoading } = useUserStories();
   const createStory = useCreateUserStory();
   const updateStory = useUpdateUserStory();
   const deleteStory = useDeleteUserStory();
 
   const [isCreating, setIsCreating] = useState(false);
   const [editingId, setEditingId] = useState<string | null>(null);
   const [newTitle, setNewTitle] = useState("");
   const [newContent, setNewContent] = useState("");
   const [editTitle, setEditTitle] = useState("");
   const [editContent, setEditContent] = useState("");
 
   const handleCreate = async () => {
     if (!newTitle.trim()) {
       toast({ title: "Please enter a title", variant: "destructive" });
       return;
     }
 
     try {
       await createStory.mutateAsync({ title: newTitle, content: newContent });
       toast({ title: "Story created!" });
       setIsCreating(false);
       setNewTitle("");
       setNewContent("");
     } catch (error) {
       toast({ title: "Error creating story", variant: "destructive" });
     }
   };
 
   const handleEdit = (story: any) => {
     setEditingId(story.id);
     setEditTitle(story.title);
     setEditContent(story.content || "");
   };
 
   const handleSaveEdit = async () => {
     if (!editingId) return;
 
     try {
       await updateStory.mutateAsync({
         id: editingId,
         title: editTitle,
         content: editContent,
       });
       toast({ title: "Story updated!" });
       setEditingId(null);
     } catch (error) {
       toast({ title: "Error updating story", variant: "destructive" });
     }
   };
 
   const handleDelete = async (id: string) => {
     try {
       await deleteStory.mutateAsync(id);
       toast({ title: "Story deleted" });
     } catch (error) {
       toast({ title: "Error deleting story", variant: "destructive" });
     }
   };
 
   if (!user) {
     return (
       <MainLayout>
         <div className="container mx-auto px-4 py-16 text-center">
           <h1 className="text-3xl font-display mb-4">Past Stories</h1>
           <Card className="max-w-md mx-auto">
             <CardHeader>
               <CardTitle>Login Required</CardTitle>
             </CardHeader>
             <CardContent className="space-y-4">
               <p className="text-muted-foreground">Please log in to view your stories.</p>
               <Link to="/login">
                 <Button className="w-full">Login</Button>
               </Link>
             </CardContent>
           </Card>
         </div>
       </MainLayout>
     );
   }
 
   return (
     <MainLayout>
       <div className="container mx-auto px-4 py-8 max-w-4xl">
         <h1 className="text-3xl font-display text-center mb-8">Past Stories</h1>
 
         {/* Create Button */}
         <div className="flex justify-end mb-6">
           <Dialog open={isCreating} onOpenChange={setIsCreating}>
             <DialogTrigger asChild>
               <Button className="gap-2">
                 <Plus className="w-4 h-4" />
                 New Story
               </Button>
             </DialogTrigger>
             <DialogContent>
               <DialogHeader>
                 <DialogTitle>Create New Story</DialogTitle>
               </DialogHeader>
               <div className="space-y-4">
                 <Input
                   placeholder="Story title"
                   value={newTitle}
                   onChange={(e) => setNewTitle(e.target.value)}
                 />
                 <Textarea
                   placeholder="Write your story..."
                   value={newContent}
                   onChange={(e) => setNewContent(e.target.value)}
                   className="min-h-[200px]"
                 />
                 <div className="flex gap-2 justify-end">
                   <Button variant="outline" onClick={() => setIsCreating(false)}>
                     Cancel
                   </Button>
                   <Button onClick={handleCreate} disabled={createStory.isPending}>
                     {createStory.isPending ? "Creating..." : "Create"}
                   </Button>
                 </div>
               </div>
             </DialogContent>
           </Dialog>
         </div>
 
         {/* Stories List */}
         {isLoading ? (
           <div className="text-center py-12">
             <p className="text-muted-foreground">Loading stories...</p>
           </div>
         ) : stories?.length === 0 ? (
           <Card className="text-center py-12">
             <CardContent>
               <p className="text-muted-foreground mb-4">You haven't created any stories yet.</p>
               <Button onClick={() => setIsCreating(true)}>Create Your First Story</Button>
             </CardContent>
           </Card>
         ) : (
           <div className="space-y-4">
             {stories?.map((story) => (
               <Card key={story.id}>
                 <CardContent className="p-4">
                   {editingId === story.id ? (
                     <div className="space-y-4">
                       <Input
                         value={editTitle}
                         onChange={(e) => setEditTitle(e.target.value)}
                       />
                       <Textarea
                         value={editContent}
                         onChange={(e) => setEditContent(e.target.value)}
                         className="min-h-[150px]"
                       />
                       <div className="flex gap-2 justify-end">
                         <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                           <X className="w-4 h-4 mr-1" />
                           Cancel
                         </Button>
                         <Button size="sm" onClick={handleSaveEdit} disabled={updateStory.isPending}>
                           <Save className="w-4 h-4 mr-1" />
                           {updateStory.isPending ? "Saving..." : "Save"}
                         </Button>
                       </div>
                     </div>
                   ) : (
                     <div className="flex items-start justify-between gap-4">
                       <div className="flex-1">
                         <h3 className="font-medium text-lg mb-1">{story.title}</h3>
                         <p className="text-sm text-muted-foreground mb-2">
                           {format(new Date(story.updated_at), "PPP")}
                         </p>
                         {story.content && (
                           <p className="text-muted-foreground line-clamp-2">{story.content}</p>
                         )}
                       </div>
                       <div className="flex gap-2">
                         <Button variant="ghost" size="icon" onClick={() => handleEdit(story)}>
                           <Edit className="w-4 h-4" />
                         </Button>
                         <AlertDialog>
                           <AlertDialogTrigger asChild>
                             <Button variant="ghost" size="icon">
                               <Trash2 className="w-4 h-4" />
                             </Button>
                           </AlertDialogTrigger>
                           <AlertDialogContent>
                             <AlertDialogHeader>
                               <AlertDialogTitle>Delete Story?</AlertDialogTitle>
                               <AlertDialogDescription>
                                 This action cannot be undone.
                               </AlertDialogDescription>
                             </AlertDialogHeader>
                             <AlertDialogFooter>
                               <AlertDialogCancel>Cancel</AlertDialogCancel>
                               <AlertDialogAction onClick={() => handleDelete(story.id)}>
                                 Delete
                               </AlertDialogAction>
                             </AlertDialogFooter>
                           </AlertDialogContent>
                         </AlertDialog>
                       </div>
                     </div>
                   )}
                 </CardContent>
               </Card>
             ))}
           </div>
         )}
       </div>
     </MainLayout>
   );
 };
 
 export default MyStories;