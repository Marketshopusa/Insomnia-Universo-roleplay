import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { STORY_VOICES, getStoryVoice, normalizeStoryVoice, setStoryVoice } from "@/lib/voices";
import { MAX_STORY_COVER_BYTES } from "@/lib/storyCover";
import { useCategories } from "@/hooks/useStories";
import { cn } from "@/lib/utils";

export interface ConfigurableStory {
  id: string;
  title: string;
  description?: string | null;
  story_context?: string | null;
  cover_image?: string | null;
  character_role?: string | null;
  character_age?: number | null;
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
  const queryClient = useQueryClient();
  const { language } = useLanguage();
  const es = language === "es";

  const { data: availableCategories } = useCategories();
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [storyContext, setStoryContext] = useState("");
  const [character, setCharacter] = useState("");
  const [characterAge, setCharacterAge] = useState<number>(21);
  const [player, setPlayer] = useState("");
  const [type, setType] = useState<"adventure" | "roleplay" | "real_sex">("roleplay");
  const [explicit, setExplicit] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverType, setCoverType] = useState<string | null>(null);
  const [voice, setVoice] = useState(() => getStoryVoice(story?.id));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !story) return;

    setTitle(story.title ?? "");
    setDescription(story.description ?? "");
    // If story_context is missing or empty, fall back to description so the development prompt is never empty
    const initialContext = (story.story_context || "").trim() || (story.description || "").trim();
    setStoryContext(initialContext);
    setCharacter(story.character_role ?? "");
    setCharacterAge(story.character_age ? Math.max(18, Number(story.character_age)) : 21);
    setPlayer(story.player_role ?? "");
    setType((story.story_type as any) ?? "roleplay");
    setExplicit(!!story.has_explicit_images);
    setVoice(getStoryVoice(story.id));
    setSelectedCategories([]);

    let cancelled = false;
    (async () => {
      // 1. Fetch the complete story record directly from Supabase so we have fresh and full fields
      const { data: dbStory } = await supabase
        .from("stories")
        .select("*")
        .eq("id", story.id)
        .maybeSingle();

      if (cancelled) return;

      if (dbStory) {
        setTitle(dbStory.title ?? "");
        setDescription(dbStory.description ?? "");
        // Resolve development prompt: prefer story_context, fall back to description
        const resolvedContext = (dbStory.story_context || "").trim() || (dbStory.description || "").trim();
        setStoryContext(resolvedContext);
        setCharacter(dbStory.character_role ?? "");
        setCharacterAge((dbStory as any).character_age ? Math.max(18, Number((dbStory as any).character_age)) : 21);
        setPlayer(dbStory.player_role ?? "");
        setType((dbStory.story_type as any) ?? "roleplay");
        setExplicit(!!dbStory.has_explicit_images);
      }

      // Fetch story categories
      const { data: storyCats } = await supabase
        .from("story_categories")
        .select("category_id")
        .eq("story_id", story.id);
      if (!cancelled && storyCats) {
        setSelectedCategories(storyCats.map((sc: any) => sc.category_id));
      }

      // If both story_context and description were empty, check if user has a narrative in story_sessions
      if (user && (!dbStory || (!(dbStory.story_context || "").trim() && !(dbStory.description || "").trim()))) {
        const { data: sess } = await supabase
          .from("story_sessions")
          .select("narrative")
          .eq("user_id", user.id)
          .eq("story_id", story.id)
          .maybeSingle();
        if (cancelled) return;
        if (sess?.narrative) {
          setStoryContext(sess.narrative);
        }
      }

      let url = dbStory?.cover_image ?? story.cover_image ?? null;
      if (user) {
        const { data } = await supabase
          .from("story_customizations")
          .select("cover_media_url, cover_media_type, voice")
          .eq("user_id", user.id)
          .eq("story_id", story.id)
          .maybeSingle();
        if (cancelled) return;
        if (data?.cover_media_url) url = data.cover_media_url;
        if (data?.voice) setVoice(normalizeStoryVoice(data.voice));
      }
      if (cancelled) return;
      setCoverUrl(url);
      setCoverType(mediaTypeOf(url));
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, story?.id, user?.id]);

  const uploadCover = async (file: File) => {
    if (!user) return;
    if (file.size > MAX_STORY_COVER_BYTES) {
      toast({
        title: es ? "La portada supera el límite de 50 MB. Usa un MP4 más corto o comprimido." : "The cover exceeds 50 MB. Use a shorter or compressed MP4.",
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
    if (!title.trim()) {
      toast({ title: es ? "Ponle un título" : "Add a title", variant: "destructive" });
      return;
    }
    if (characterAge < 18) {
      toast({
        title: es ? "Edad no permitida (+18)" : "Invalid age (18+)",
        description: es ? "La edad del personaje debe ser de al menos 18 años. No se admiten personajes menores de edad." : "Character age must be at least 18.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      setStoryVoice(story.id, voice);

      const cleanContext = storyContext.trim() || description.trim() || null;
      const cleanDesc = description.trim() || (cleanContext ? cleanContext.slice(0, 160) : null);
      const storyPayload = {
        title: title.trim(),
        description: cleanDesc,
        story_context: cleanContext,
        cover_image: coverUrl,
        character_role: character.trim() || null,
        character_age: Math.max(18, characterAge),
        player_role: player.trim() || "hombre",
        story_type: (explicit ? "real_sex" : type) as "adventure" | "roleplay" | "real_sex",
        has_explicit_images: explicit,
      };

      const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (isUuid(story.id)) {
        const invokeRes = await supabase.functions.invoke("adult-story-chat", {
          body: {
            action: "update-story",
            storyId: story.id,
            ...storyPayload,
            category_ids: selectedCategories,
          },
        });

        if (invokeRes.error || !(invokeRes.data as any)?.success) {
          await supabase.from("stories").update(storyPayload).eq("id", story.id);
        }

        const personalCover = coverUrl && coverUrl !== story.cover_image ? coverUrl : null;
        await supabase.from("story_customizations").upsert(
          {
            user_id: user.id,
            story_id: story.id,
            cover_media_url: personalCover,
            cover_media_type: personalCover ? coverType : null,
            voice,
          },
          { onConflict: "user_id,story_id" }
        );
      } else {
        try {
          const rawLocal = localStorage.getItem("talkiemate_custom_chars_v2");
          const list = rawLocal ? JSON.parse(rawLocal) : [];
          const idx = list.findIndex((c: any) => c.id === story.id);
          const customEntry = {
            id: story.id,
            name: title.trim(),
            roleTitle: character.trim() || "Compañera",
            bio: cleanDesc,
            starterMessage: cleanContext || cleanDesc,
            avatar: coverUrl || story.cover_image,
            voiceName: voice,
            isNsfw: explicit,
          };
          if (idx >= 0) {
            list[idx] = { ...list[idx], ...customEntry };
          } else {
            list.push(customEntry);
          }
          localStorage.setItem("talkiemate_custom_chars_v2", JSON.stringify(list));
        } catch {}
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["story", story.id] }),
        queryClient.invalidateQueries({ queryKey: ["stories"] }),
        queryClient.invalidateQueries({ queryKey: ["my-custom-stories"] }),
        queryClient.invalidateQueries({ queryKey: ["reading-history", user.id] }),
        queryClient.invalidateQueries({ queryKey: ["story-customizations", user.id] }),
      ]);
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

  const selectedCategorySet = new Set(selectedCategories);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{es ? "Configurar historia" : "Configure story"}</DialogTitle>
          <DialogDescription>
            {es
              ? "Modifica los datos, la portada y la voz de esta historia."
              : "Edit the details, cover and voice of this story."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-1 block text-xs">{es ? "Título" : "Title"}</Label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="story-description" className="mb-1 block text-xs">{es ? "Descripción corta de la tarjeta" : "Short card description"}</Label>
            <Input id="story-description" value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="story-context" className="mb-1 block text-xs">{es ? "Desarrollo de la historia" : "Story development"}</Label>
            <Textarea id="story-context" value={storyContext} onChange={(event) => setStoryContext(event.target.value)} className="min-h-[180px]" placeholder={es ? "Contexto, personajes y hechos que debe conocer la IA." : "Context, characters and facts the AI should know."} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="mb-1 block text-xs">{es ? "Tu rol" : "Your role"}</Label>
              <Input value={player} onChange={(event) => setPlayer(event.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs">{es ? "Personaje IA" : "AI character"}</Label>
              <Input value={character} onChange={(event) => setCharacter(event.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs font-semibold text-rose-400">
                {es ? "Edad Personaje (Mín. 18)" : "Character Age (Min 18)"}
              </Label>
              <Input
                type="number"
                min={18}
                max={120}
                value={characterAge}
                onChange={(event) => setCharacterAge(Math.max(18, parseInt(event.target.value, 10) || 18))}
                className="border-rose-900/40 font-bold"
              />
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

          {availableCategories && availableCategories.length > 0 && (
            <div>
              <Label className="mb-1.5 block text-xs">{es ? "Categorías de la historia" : "Story categories"}</Label>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 border border-border/60 rounded-md bg-muted/20">
                {availableCategories.map((cat) => {
                  const isSelected = selectedCategorySet.has(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setSelectedCategories((prev) => {
                          const next = new Set(prev);
                          if (next.has(cat.id)) next.delete(cat.id);
                          else next.add(cat.id);
                          return Array.from(next);
                        });
                      }}
                      className={cn(
                        "text-xs px-2.5 py-1 rounded-full border transition-colors",
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary font-medium"
                          : "bg-background/80 text-muted-foreground border-border hover:border-primary/50"
                      )}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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
                  aria-label={es ? "Quitar portada" : "Remove cover"}
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
