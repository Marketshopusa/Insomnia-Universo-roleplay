import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/hooks/use-toast";
import { STORY_VOICES, getStoryVoice, setStoryVoice } from "@/lib/voices";

export interface ConfigurableStory {
  id: string;
  title: string;
  description?: string | null;
  cover_image?: string | null;
  character_role?: string | null;
  player_role?: string | null;
  story_type?: "adventure" | "roleplay" | "real_sex" | null;
  has_explicit_images?: boolean | null;
  created_by?: string | null;
}

interface StoryConfigDialogProps {
  story: ConfigurableStory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export const mediaTypeOf = (url?: string | null) => {
  if (!url) return null;
  return /\.(mp4|webm|mov|m4v|ogv)(\?|$)/i.test(url) ? "video" : "image";
};

/** One configuration panel shared by every story card in the app. */
export const StoryConfigDialog = ({ story, open, onOpenChange, onSaved }: StoryConfigDialogProps) => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const es = language === "es";
  const isOwner = !!user && !!story?.created_by && story.created_by === user.id;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [character, setCharacter] = useState("");
  const [player, setPlayer] = useState("");
  const [type, setType] = useState<"adventure" | "roleplay" | "real_sex">("roleplay");
  const [explicit, setExplicit] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverType, setCoverType] = useState<string | null>(null);
  const [voice, setVoice] = useState(getStoryVoice(story?.id));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !story) return;
    setTitle(story.title ?? "");
    setDescription(story.description ?? "");
    setCharacter(story.character_role ?? "");
    setPlayer(story.player_role ?? "");
    setType((story.story_type as any) ?? "roleplay");
    setExplicit(!!story.has_explicit_images);
    setVoice(getStoryVoice(story.id));

    let cancelled = false;
    (async () => {
      let url = story.cover_image ?? null;
      if (user) {
        const { data } = await supabase
          .from("story_customizations")
          .select("cover_media_url, cover_media_type, voice")
          .eq("user_id", user.id)
          .eq("story_id", story.id)
          .maybeSingle();
        if (cancelled) return;
        if (data?.cover_media_url) url = data.cover_media_url;
        if (data?.voice) setVoice(data.voice);
      }
      if (cancelled) return;
      setCoverUrl(url);
      setCoverType(mediaTypeOf(url));
    })();

    return () => {
      cancelled = true;
    };
  }, [open, story, user]);

  const uploadCover = async (file: File) => {
    if (!user) return;
    if (file.size > 20 * 1024 * 1024) {
      toast({
        title: es ? "El archivo supera el límite de 20MB" : "The file is larger than 20MB",
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    try {
      const extension = file.name.split(".").pop() || "bin";
      const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage
        .from("user-story-covers")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("user-story-covers").getPublicUrl(path);
      setCoverUrl(data.publicUrl);
      setCoverType(file.type.startsWith("video") ? "video" : "image");
    } catch {
      toast({
        title: es ? "No se pudo subir el archivo" : "The file could not be uploaded",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!story || !user) return;
    if (isOwner && !title.trim()) {
      toast({ title: es ? "Ponle un título" : "Add a title", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      setStoryVoice(story.id, voice);

      if (isOwner) {
        const { error } = await supabase
          .from("stories")
          .update({
            title: title.trim(),
            description: description.trim() || null,
            cover_image: coverUrl,
            character_role: character.trim() || null,
            player_role: player.trim() || "hombre",
            story_type: (explicit ? "real_sex" : type) as "adventure" | "roleplay" | "real_sex",
            has_explicit_images: explicit,
          })
          .eq("id", story.id)
          .eq("created_by", user.id);
        if (error) throw error;
      }

      const personalCover = coverUrl && coverUrl !== story.cover_image ? coverUrl : null;
      const { error: customError } = await supabase.from("story_customizations").upsert(
        {
          user_id: user.id,
          story_id: story.id,
          cover_media_url: isOwner ? null : personalCover,
          cover_media_type: isOwner ? null : personalCover ? coverType : null,
          voice,
        },
        { onConflict: "user_id,story_id" }
      );
      if (customError) throw customError;

      toast({ title: es ? "Cambios guardados" : "Changes saved" });
      onSaved?.();
      onOpenChange(false);
    } catch {
      toast({
        title: es ? "No se pudieron guardar los cambios" : "The changes could not be saved",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{es ? "Configurar historia" : "Configure story"}</DialogTitle>
          <DialogDescription>
            {isOwner
              ? es
                ? "Modifica los datos, la portada y la voz de esta historia."
                : "Edit the details, cover and voice of this story."
              : es
                ? "Elige tu portada y la voz para esta historia. Solo tú verás estos cambios."
                : "Pick your own cover and voice for this story. Only you see these changes."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isOwner && (
            <>
              <div>
                <Label className="mb-1 block text-xs">{es ? "Título" : "Title"}</Label>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} />
              </div>
              <div>
                <Label className="mb-1 block text-xs">{es ? "Descripción corta" : "Short description"}</Label>
                <Input value={description} onChange={(event) => setDescription(event.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1 block text-xs">{es ? "Tu rol" : "Your role"}</Label>
                  <Input value={player} onChange={(event) => setPlayer(event.target.value)} />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">{es ? "Personaje IA" : "AI character"}</Label>
                  <Input value={character} onChange={(event) => setCharacter(event.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 items-end">
                <div>
                  <Label className="mb-1 block text-xs">{es ? "Tipo" : "Type"}</Label>
                  <Select value={type} onValueChange={(value: any) => setType(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="roleplay">{es ? "Juego de Roles" : "Roleplay"}</SelectItem>
                      <SelectItem value="adventure">{es ? "Aventura" : "Adventure"}</SelectItem>
                      <SelectItem value="real_sex">{es ? "Sexo Real" : "Real Sex"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 h-10">
                  <Switch id="story-config-explicit" checked={explicit} onCheckedChange={setExplicit} />
                  <Label htmlFor="story-config-explicit" className="text-xs">
                    {es ? "+18 Contenido explícito" : "+18 Explicit content"}
                  </Label>
                </div>
              </div>
            </>
          )}

          <div>
            <Label className="mb-1 block text-xs">{es ? "Voz del personaje" : "Character voice"}</Label>
            <Select value={voice} onValueChange={setVoice}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STORY_VOICES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label} — {es ? option.descriptionEs : option.descriptionEn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*,image/gif"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) await uploadCover(file);
              event.target.value = "";
            }}
          />

          {coverUrl ? (
            <div className="relative overflow-hidden border border-border">
              {coverType === "video" ? (
                <video src={coverUrl} className="w-full max-h-56 object-cover" controls playsInline />
              ) : (
                <img src={coverUrl} alt={story?.title || "cover"} className="w-full max-h-56 object-cover" />
              )}
              <div className="absolute top-2 right-2 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : es ? "Cambiar" : "Replace"}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="h-8 w-8"
                  onClick={() => {
                    setCoverUrl(null);
                    setCoverType(null);
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
              {es ? "Agregar portada (imagen, gif o video)" : "Add cover (image, gif or video)"}
            </Button>
          )}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {es ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={save} disabled={saving || uploading}>
              {saving ? (es ? "Guardando..." : "Saving...") : es ? "Guardar cambios" : "Save changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
