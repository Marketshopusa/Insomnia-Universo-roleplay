import { useState, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Link, useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { Trash2, Plus, X, ImagePlus, Loader2, MoreVertical, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StoryCard } from "@/components/chat/StoryCard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

const MyStories = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const { data: stories, isLoading } = useQuery({
    queryKey: ["my-custom-stories", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("stories")
        .select("*")
        .eq("created_by", user.id)
        .eq("source", "custom")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCharacter, setNewCharacter] = useState("");
  const [newPlayer, setNewPlayer] = useState("hombre");
  const [newType, setNewType] = useState<"adventure" | "roleplay" | "real_sex">("roleplay");
  const [newExplicit, setNewExplicit] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [newCoverUrl, setNewCoverUrl] = useState<string | null>(null);
  const [newCoverType, setNewCoverType] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const newFileRef = useRef<HTMLInputElement>(null);

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

  const resetForm = () => {
    setEditingId(null);
    setNewTitle("");
    setNewDescription("");
    setNewCharacter("");
    setNewPlayer("hombre");
    setNewType("roleplay");
    setNewExplicit(false);
    setNewContent("");
    setNewCoverUrl(null);
    setNewCoverType(null);
  };

  const guessMediaType = (url?: string | null) => {
    if (!url) return null;
    return /\.(mp4|webm|mov|m4v|ogv)(\?|$)/i.test(url) ? "video" : "image";
  };

  const openEdit = (story: any) => {
    setEditingId(story.id);
    setNewTitle(story.title ?? "");
    setNewDescription(story.description ?? "");
    setNewCharacter(story.character_role ?? "");
    setNewPlayer(story.player_role ?? "hombre");
    setNewType((story.story_type as any) ?? "roleplay");
    setNewExplicit(!!story.has_explicit_images);
    setNewContent("");
    setNewCoverUrl(story.cover_image ?? null);
    setNewCoverType(guessMediaType(story.cover_image));
    setIsCreating(true);
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) {
      toast({ title: t("myStories.toast.needTitle"), variant: "destructive" });
      return;
    }
    if (!user) return;
    setCreating(true);
    try {
      const payload = {
        title: newTitle.trim(),
        description: newDescription.trim() || newContent.slice(0, 140) || "Historia personalizada",
        cover_image: newCoverUrl,
        character_role: newCharacter.trim() || null,
        player_role: newPlayer || "hombre",
        story_type: (newExplicit ? "real_sex" : newType) as "adventure" | "roleplay" | "real_sex",
        has_explicit_images: newExplicit,
      };

      if (editingId) {
        const { error } = await supabase
          .from("stories")
          .update(payload)
          .eq("id", editingId)
          .eq("created_by", user.id);
        if (error) throw error;
        toast({ title: "Cambios guardados" });
      } else {
        const { error } = await supabase.from("stories").insert({
          ...payload,
          source: "custom",
          created_by: user.id,
        });
        if (error) throw error;
        toast({ title: t("myStories.toast.created") });
      }

      setIsCreating(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["my-custom-stories"] });
      queryClient.invalidateQueries({ queryKey: ["stories"] });
    } catch (error) {
      toast({
        title: editingId ? "No se pudieron guardar los cambios" : t("myStories.toast.createError"),
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("stories").delete().eq("id", id);
      if (error) throw error;
      toast({ title: t("myStories.toast.deleted") });
      queryClient.invalidateQueries({ queryKey: ["my-custom-stories"] });
      queryClient.invalidateQueries({ queryKey: ["stories"] });
    } catch (error) {
      toast({ title: t("myStories.toast.deleteError"), variant: "destructive" });
    }
  };

  // Resets ONLY the roleplay/conversation for a story (keeps the card).
  const handleResetRoleplay = async (id: string) => {
    if (!user) return;
    setResetting(true);
    try {
      const { error } = await supabase
        .from("story_sessions")
        .delete()
        .eq("user_id", user.id)
        .eq("story_id", id);
      if (error) throw error;
      toast({ title: "Roleplay reiniciado. La conversación se borró y nadie podrá verla." });
    } catch (error) {
      toast({ title: "No se pudo reiniciar el roleplay", variant: "destructive" });
    } finally {
      setResetting(false);
      setConfirmResetId(null);
    }
  };

  const CoverPicker = ({
    url,
    type,
    onPick,
    onClear,
  }: {
    url: string | null;
    type: string | null;
    onPick: () => void;
    onClear: () => void;
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
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle>{t("myStories.loginRequired")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">{t("myStories.loginMessage")}</p>
              <Link to="/login">
                <Button className="w-full">{t("nav.login")}</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <h1 className="text-3xl font-display text-center mb-8">{t("myStories.title")}</h1>

        <div className="flex justify-end mb-6">
          <Dialog
            open={isCreating}
            onOpenChange={(o) => {
              setIsCreating(o);
              if (!o) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button className="gap-2" onClick={() => resetForm()}>
                <Plus className="w-4 h-4" />
                {t("myStories.newStory")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingId ? "Configurar historia" : t("myStories.createNew")}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label className="mb-1 block text-xs">Título</Label>
                  <Input
                    placeholder={t("myStories.titlePlaceholder")}
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Descripción corta</Label>
                  <Input
                    placeholder="Una línea que enganche al lector"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-1 block text-xs">Tu rol</Label>
                    <Input
                      placeholder="hombre / mujer / ..."
                      value={newPlayer}
                      onChange={(e) => setNewPlayer(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">Personaje IA</Label>
                    <Input
                      placeholder="Nombre y rol del personaje"
                      value={newCharacter}
                      onChange={(e) => setNewCharacter(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <Label className="mb-1 block text-xs">Tipo</Label>
                    <Select value={newType} onValueChange={(v: any) => setNewType(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="roleplay">Juego de Roles</SelectItem>
                        <SelectItem value="adventure">Aventura</SelectItem>
                        <SelectItem value="real_sex">Sexo Real</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 h-10">
                    <Switch id="explicit" checked={newExplicit} onCheckedChange={setNewExplicit} />
                    <Label htmlFor="explicit" className="text-xs">+18 Contenido explícito</Label>
                  </div>
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Desarrollo (opcional)</Label>
                  <Textarea
                    placeholder={t("myStories.contentPlaceholder")}
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    className="min-h-[120px]"
                  />
                </div>
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
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setIsCreating(false)}>
                    {t("common.cancel")}
                  </Button>
                  <Button onClick={handleCreate} disabled={creating || uploading}>
                    {creating ? t("common.creating") : t("common.create")}
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
          <Card className="text-center py-12">
            <CardContent>
              <p className="text-muted-foreground mb-4">{t("myStories.empty")}</p>
              <Button onClick={() => setIsCreating(true)}>{t("myStories.createFirst")}</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {stories?.map((story: any, idx: number) => (
              <div key={story.id} className="relative group">
                <StoryCard
                  story={story}
                  index={idx}
                  onClick={() => navigate(`/story/${story.id}`)}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition z-10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setConfirmResetId(story.id);
                      }}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reiniciar roleplay
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={(e) => {
                        e.preventDefault();
                        setConfirmDeleteId(story.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Eliminar historia
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}

        {/* Reset roleplay confirmation (keeps the card) */}
        <AlertDialog open={!!confirmResetId} onOpenChange={(o) => !o && setConfirmResetId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reiniciar roleplay</AlertDialogTitle>
              <AlertDialogDescription>
                Esto borra tu conversación y empieza la historia desde cero. La tarjeta NO se elimina y nadie podrá ver el roleplay anterior.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={resetting}>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => confirmResetId && handleResetRoleplay(confirmResetId)}
                disabled={resetting}
              >
                {resetting ? "Reiniciando..." : "Reiniciar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete story (card) confirmation */}
        <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("myStories.deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("myStories.deleteDesc")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (confirmDeleteId) handleDelete(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
              >
                {t("common.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MainLayout>
  );
};

export default MyStories;
