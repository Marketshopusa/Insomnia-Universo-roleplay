import { useState, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useUserStories, useCreateUserStory, useUpdateUserStory, useDeleteUserStory } from "@/hooks/useUserStories";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { Trash2, Edit, Plus, X, Save, ImagePlus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
  const { t } = useLanguage();
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
  const [newCoverUrl, setNewCoverUrl] = useState<string | null>(null);
  const [newCoverType, setNewCoverType] = useState<string | null>(null);
  const [editCoverUrl, setEditCoverUrl] = useState<string | null>(null);
  const [editCoverType, setEditCoverType] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const newFileRef = useRef<HTMLInputElement>(null);
  const editFileRef = useRef<HTMLInputElement>(null);

  const uploadCover = async (file: File): Promise<{ url: string; type: string } | null> => {
    if (!user) return null;
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "El archivo supera el límite de 20MB", variant: "destructive" });
      return null;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("user-story-covers")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("user-story-covers").getPublicUrl(path);
      const type = file.type.startsWith("video") ? "video" : "image";
      return { url: data.publicUrl, type };
    } catch (e) {
      toast({ title: "Error al subir el archivo", variant: "destructive" });
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) {
      toast({ title: t("myStories.toast.needTitle"), variant: "destructive" });
      return;
    }

    try {
      await createStory.mutateAsync({
        title: newTitle,
        content: newContent,
        cover_media_url: newCoverUrl,
        cover_media_type: newCoverType,
      });
      toast({ title: t("myStories.toast.created") });
      setIsCreating(false);
      setNewTitle("");
      setNewContent("");
      setNewCoverUrl(null);
      setNewCoverType(null);
    } catch (error) {
      toast({ title: t("myStories.toast.createError"), variant: "destructive" });
    }
  };

  const handleEdit = (story: any) => {
    setEditingId(story.id);
    setEditTitle(story.title);
    setEditContent(story.content || "");
    setEditCoverUrl(story.cover_media_url || null);
    setEditCoverType(story.cover_media_type || null);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;

    try {
      await updateStory.mutateAsync({
        id: editingId,
        title: editTitle,
        content: editContent,
        cover_media_url: editCoverUrl,
        cover_media_type: editCoverType,
      });
      toast({ title: t("myStories.toast.updated") });
      setEditingId(null);
    } catch (error) {
      toast({ title: t("myStories.toast.updateError"), variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteStory.mutateAsync(id);
      toast({ title: t("myStories.toast.deleted") });
    } catch (error) {
      toast({ title: t("myStories.toast.deleteError"), variant: "destructive" });
    }
  };

  const CoverPicker = ({
    url,
    type,
    onPick,
    onClear,
    inputRef,
  }: {
    url: string | null;
    type: string | null;
    onPick: () => void;
    onClear: () => void;
    inputRef: React.RefObject<HTMLInputElement>;
  }) => (
    <>
      {url ? (
        <div className="relative rounded-md overflow-hidden border border-border">
          {type === "video" ? (
            <video src={url} className="w-full max-h-56 object-cover" controls />
          ) : (
            <img src={url} alt="cover" className="w-full max-h-56 object-cover" />
          )}
          <div className="absolute top-2 right-2 flex gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={onPick} disabled={uploading}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Cambiar"}
            </Button>
            <Button type="button" size="icon" variant="destructive" className="h-8 w-8" onClick={onClear}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" className="w-full gap-2" onClick={onPick} disabled={uploading}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
          Agregar portada (imagen, gif o video)
        </Button>
      )}
    </>
  );

  if (!user) {
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-3xl font-display mb-4">{t("myStories.title")}</h1>
          <CardBox className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle>{t("myStories.loginRequired")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">{t("myStories.loginMessage")}</p>
              <Link to="/login">
                <Button className="w-full">{t("nav.login")}</Button>
              </Link>
            </CardContent>
          </CardBox>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-display text-center mb-8">{t("myStories.title")}</h1>

        <div className="flex justify-end mb-6">
          <Dialog
            open={isCreating}
            onOpenChange={(o) => {
              setIsCreating(o);
              if (!o) {
                setNewTitle("");
                setNewContent("");
                setNewCoverUrl(null);
                setNewCoverType(null);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                {t("myStories.newStory")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("myStories.createNew")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  placeholder={t("myStories.titlePlaceholder")}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
                <Textarea
                  placeholder={t("myStories.contentPlaceholder")}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="min-h-[200px]"
                />
                <input
                  ref={newFileRef}
                  type="file"
                  accept="image/*,video/*,image/gif"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const r = await uploadCover(f);
                    if (r) {
                      setNewCoverUrl(r.url);
                      setNewCoverType(r.type);
                    }
                    e.target.value = "";
                  }}
                />
                <CoverPicker
                  url={newCoverUrl}
                  type={newCoverType}
                  onPick={() => newFileRef.current?.click()}
                  onClear={() => {
                    setNewCoverUrl(null);
                    setNewCoverType(null);
                  }}
                  inputRef={newFileRef}
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setIsCreating(false)}>
                    {t("common.cancel")}
                  </Button>
                  <Button onClick={handleCreate} disabled={createStory.isPending || uploading}>
                    {createStory.isPending ? t("common.creating") : t("common.create")}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">{t("myStories.loading")}</p>
          </div>
        ) : stories?.length === 0 ? (
          <CardBox className="text-center py-12">
            <CardContent>
              <p className="text-muted-foreground mb-4">{t("myStories.empty")}</p>
              <Button onClick={() => setIsCreating(true)}>{t("myStories.createFirst")}</Button>
            </CardContent>
          </CardBox>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {stories?.map((story: any) => (
              <Card key={story.id} className="overflow-hidden">
                <CardContent className="p-0">
                  {editingId === story.id ? (
                    <div className="space-y-4 p-4">
                      <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                      <Textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="min-h-[150px]"
                      />
                      <input
                        ref={editFileRef}
                        type="file"
                        accept="image/*,video/*,image/gif"
                        className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const r = await uploadCover(f);
                          if (r) {
                            setEditCoverUrl(r.url);
                            setEditCoverType(r.type);
                          }
                          e.target.value = "";
                        }}
                      />
                      <CoverPicker
                        url={editCoverUrl}
                        type={editCoverType}
                        onPick={() => editFileRef.current?.click()}
                        onClear={() => {
                          setEditCoverUrl(null);
                          setEditCoverType(null);
                        }}
                        inputRef={editFileRef}
                      />
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                          <X className="w-4 h-4 mr-1" />
                          {t("common.cancel")}
                        </Button>
                        <Button size="sm" onClick={handleSaveEdit} disabled={updateStory.isPending || uploading}>
                          <Save className="w-4 h-4 mr-1" />
                          {updateStory.isPending ? t("common.saving") : t("common.save")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {story.cover_media_url ? (
                        story.cover_media_type === "video" ? (
                          <video
                            src={story.cover_media_url}
                            className="w-full aspect-video object-cover bg-muted"
                            muted
                            loop
                            playsInline
                            autoPlay
                          />
                        ) : (
                          <img
                            src={story.cover_media_url}
                            alt={story.title}
                            className="w-full aspect-video object-cover bg-muted"
                          />
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleEdit(story)}
                          className="w-full aspect-video flex items-center justify-center bg-muted/40 border-b border-border text-muted-foreground hover:bg-muted/60 transition"
                        >
                          <ImagePlus className="w-6 h-6 mr-2" />
                          Agregar portada
                        </button>
                      )}
                      <div className="flex items-start justify-between gap-4 p-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-lg mb-1 truncate">{story.title}</h3>
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
                                <AlertDialogTitle>{t("myStories.deleteTitle")}</AlertDialogTitle>
                                <AlertDialogDescription>{t("myStories.deleteDesc")}</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(story.id)}>
                                  {t("common.delete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
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
