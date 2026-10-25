import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  User,
  Image as ImageIcon,
  Volume2,
  Play,
  Square,
  Plus,
  Trash2,
  RotateCcw,
  Upload,
  Check,
  Sparkles,
  Clipboard,
  Film,
  Loader2,
  ImagePlus,
  FolderUp,
  Link as LinkIcon
} from "lucide-react";
import { STORY_VOICES, normalizeStoryVoice, setStoryVoice } from "@/lib/voices";
import { streamSpeech, type SpeechStream } from "@/lib/ttsStream";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface CharacterItem {
  id: string;
  name: string;
  age: number;
  gender: "female" | "male" | "non-binary";
  style: "realistic" | "anime";
  avatar: string;
  gallery: string[];
  roleTitle: string;
  roleTitleEs?: string;
  roleTitleEn?: string;
  bio: string;
  bioEs?: string;
  bioEn?: string;
  shortBio: string;
  shortBioEs?: string;
  shortBioEn?: string;
  likesCount: string;
  imageCount: number;
  audioCount: number;
  affinityLevel: number;
  affinityTitle: string;
  affinityTitleEs?: string;
  affinityTitleEn?: string;
  affinityXp: number;
  category: "featured" | "popular" | "romance" | "spicy";
  starterMessage: string;
  starterMessageEs?: string;
  starterMessageEn?: string;
  voiceName: string;
}

interface ChatCharacterConfigDialogProps {
  character: CharacterItem | null;
  isNew?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updated: CharacterItem) => void;
  onResetHistory?: () => void;
}

/** Determina si una URL corresponde a un video (MP4, WebM, MOV o data:video) */
export function isMediaVideo(url: string | null | undefined): boolean {
  if (!url) return false;
  return Boolean(
    url.match(/\.(mp4|webm|mov|ogg)(\?|$)/i) ||
    url.startsWith("data:video") ||
    (url.includes("user-story-covers") && (url.includes(".mp4") || url.includes(".webm") || url.includes(".mov")))
  );
}

/** Reproduce de forma garantizada con voz femenina si no hay red local */
export function playGuaranteedVoice(
  text: string,
  voiceName = "Aoede",
  onEnd?: () => void
) {
  if (typeof window === "undefined") {
    onEnd?.();
    return null;
  }

  // 1. Intentar streamSpeech de Insomnia
  try {
    const stream = streamSpeech(text, voiceName, "es", true, "mx");
    stream.done.then(() => onEnd?.()).catch(() => {
      fallbackFemaleSpeech(text, onEnd);
    });
    return stream;
  } catch {
    fallbackFemaleSpeech(text, onEnd);
    return null;
  }
}

/** Fallback femenino estricto para que NUNCA suene el hombre robótico por defecto */
export function fallbackFemaleSpeech(text: string, onEnd?: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const esVoices = voices.filter((v) => v.lang.toLowerCase().startsWith("es"));

  // Palabras clave de voces femeninas en navegadores / sistemas
  const femaleKeywords = [
    "sabina", "helena", "paulina", "monica", "zira", "laura", "lucia",
    "victoria", "hilda", "elvira", "camila", "soledad", "mia", "sofia", "valeria", "female", "mujer"
  ];
  const maleKeywords = ["raul", "david", "pablo", "jorge", "enrique", "carlos", "diego", "male", "hombre"];

  let best = esVoices.find((v) =>
    femaleKeywords.some((k) => v.name.toLowerCase().includes(k))
  );

  if (!best) {
    best = esVoices.find((v) =>
      !maleKeywords.some((k) => v.name.toLowerCase().includes(k))
    );
  }

  if (best) {
    utterance.voice = best;
  }

  utterance.lang = "es-MX";
  utterance.pitch = 1.25; // Entonación femenina dulce
  utterance.rate = 1.02;

  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();

  window.speechSynthesis.speak(utterance);
}

export const ChatCharacterConfigDialog: React.FC<ChatCharacterConfigDialogProps> = ({
  character,
  isNew = false,
  open,
  onOpenChange,
  onSave,
  onResetHistory
}) => {
  const { language } = useLanguage();
  const isEs = language === "es";
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState("info");

  // Form State
  const [name, setName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [age, setAge] = useState(25);
  const [gender, setGender] = useState<"female" | "male" | "non-binary">("female");
  const [style, setStyle] = useState<"realistic" | "anime">("realistic");
  const [bio, setBio] = useState("");
  const [starterMessage, setStarterMessage] = useState("");
  const [voiceName, setVoiceName] = useState("Aoede");
  const [avatar, setAvatar] = useState("");
  const [gallery, setGallery] = useState<string[]>([]);
  const [newPhotoUrl, setNewPhotoUrl] = useState("");

  // Media uploading state & file input refs
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  // Testing voice
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const voiceStreamRef = useRef<SpeechStream | null>(null);

  // Load character data on open
  useEffect(() => {
    if (!open) {
      stopVoicePreview();
      return;
    }

    if (character && !isNew) {
      setName(character.name || "");
      setRoleTitle(
        isEs
          ? (character.roleTitleEs || character.roleTitle || "")
          : (character.roleTitleEn || character.roleTitle || "")
      );
      setAge(character.age || 25);
      setGender(character.gender || "female");
      setStyle(character.style || "realistic");
      setBio(
        isEs
          ? (character.bioEs || character.bio || "")
          : (character.bioEn || character.bio || "")
      );
      setStarterMessage(
        isEs
          ? (character.starterMessageEs || character.starterMessage || "")
          : (character.starterMessageEn || character.starterMessage || "")
      );
      setVoiceName(normalizeStoryVoice(character.voiceName || "Aoede"));
      setAvatar(character.avatar || "");
      setGallery(character.gallery && character.gallery.length > 0 ? [...character.gallery] : [character.avatar || ""]);
    } else {
      // New Character defaults
      setName("");
      setRoleTitle(isEs ? "Compañera Íntima" : "Intimate Partner");
      setAge(26);
      setGender("female");
      setStyle("realistic");
      setBio(
        isEs
          ? "Una mujer apasionada y cariñosa que busca una conexión auténtica e íntima."
          : "A passionate and warm woman seeking an authentic and intimate connection."
      );
      setStarterMessage(
        isEs
          ? "Hola cariño... me alegra tanto tenerte aquí conmigo. ¿Qué te gustaría que hagamos hoy?"
          : "Hey there... I'm so glad to have you here with me. What would you like to do today?"
      );
      setVoiceName("Aoede");
      setAvatar("https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/6e8f818f9b187d2ebdf4e1d77521e051/3545853885239688145_69992903230.jpg");
      setGallery([
        "https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/6e8f818f9b187d2ebdf4e1d77521e051/3545853885239688145_69992903230.jpg"
      ]);
    }
    setActiveTab("info");
  }, [open, character, isNew, isEs]);

  const stopVoicePreview = () => {
    if (voiceStreamRef.current) {
      voiceStreamRef.current.stop();
      voiceStreamRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingVoice(false);
  };

  const handlePreviewVoice = () => {
    if (isPlayingVoice) {
      stopVoicePreview();
      return;
    }

    setIsPlayingVoice(true);
    const samplePhrase = isEs
      ? `Hola cariño, soy ${name || "tu compañera"}. Esta es mi voz de Insomnia... ¿te gusta cómo suena?`
      : `Hey darling, I'm ${name || "your partner"}. This is my Insomnia voice... do you like how it sounds?`;

    const stream = playGuaranteedVoice(samplePhrase, voiceName, () => {
      setIsPlayingVoice(false);
      voiceStreamRef.current = null;
    });

    if (stream) {
      voiceStreamRef.current = stream;
    }
  };

  // Upload a single file (image, GIF, MP4 video)
  const uploadFile = async (file: File): Promise<string | null> => {
    if (file.size > 60 * 1024 * 1024) {
      toast({
        title: isEs ? "Archivo supera 60 MB" : "File exceeds 60 MB",
        description: isEs ? "Por favor selecciona un video o imagen más comprimido." : "Please use a more compressed file.",
        variant: "destructive"
      });
      return null;
    }

    try {
      const ext = file.name.split(".").pop() || (file.type.startsWith("video") ? "mp4" : "jpg");
      const userId = user?.id || "public_chat";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;

      const { error } = await supabase.storage
        .from("user-story-covers")
        .upload(path, file, { upsert: false, contentType: file.type });

      if (!error) {
        const { data } = supabase.storage.from("user-story-covers").getPublicUrl(path);
        if (data?.publicUrl) return data.publicUrl;
      }
    } catch (err) {
      console.warn("Storage upload failed, falling back to data URL:", err);
    }

    // Reliable fallback: read as base64 Data URL so upload ALWAYS works
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string) || "");
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
  };

  // Upload Multiple Files from Device directly into the Carousel
  const handleUploadMultipleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    setUploadProgress({ current: 0, total: files.length });

    try {
      const newUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        setUploadProgress({ current: i + 1, total: files.length });
        const url = await uploadFile(files[i]);
        if (url && !gallery.includes(url) && !newUrls.includes(url)) {
          newUrls.push(url);
        }
      }

      if (newUrls.length > 0) {
        setGallery((prev) => [...prev, ...newUrls]);
        if (!avatar) setAvatar(newUrls[0]);
        toast({
          title: isEs ? "Archivos agregados al carrusel" : "Files added to carousel",
          description: isEs
            ? `Se han subido y agregado ${newUrls.length} archivo(s) a la galería.`
            : `Successfully uploaded and added ${newUrls.length} file(s).`
        });
      }
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      if (multiFileInputRef.current) multiFileInputRef.current.value = "";
    }
  };

  // Upload Avatar from Device
  const handleUploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const url = await uploadFile(file);
      if (url) {
        setAvatar(url);
        if (!gallery.includes(url)) {
          setGallery((prev) => [url, ...prev]);
        }
        toast({
          title: isEs ? "Avatar actualizado" : "Avatar updated",
          description: isEs ? "La foto o video principal ha sido actualizado." : "Main photo or video updated."
        });
      }
    } finally {
      setIsUploading(false);
      if (avatarFileInputRef.current) avatarFileInputRef.current.value = "";
    }
  };

  // Paste text from clipboard into URL input
  const handlePasteUrl = async (target: "newPhoto" | "avatar") => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        const cleaned = text.trim();
        if (target === "newPhoto") {
          setNewPhotoUrl(cleaned);
        } else {
          setAvatar(cleaned);
        }
        toast({ description: isEs ? "Enlace pegado del portapapeles" : "Link pasted from clipboard" });
      } else {
        toast({ description: isEs ? "El portapapeles está vacío" : "Clipboard is empty" });
      }
    } catch {
      toast({ description: isEs ? "Presiona Ctrl+V para pegar" : "Press Ctrl+V to paste" });
    }
  };

  // Add Photo/Video by URL (supports single or multiple comma/space separated URLs)
  const handleAddPhoto = () => {
    const raw = newPhotoUrl.trim();
    if (!raw) return;

    const tokens = raw.split(/[\s,\n]+/).map((t) => t.trim()).filter(Boolean);
    const toAdd: string[] = [];

    for (const token of tokens) {
      let clean = token;
      if (!clean.startsWith("http://") && !clean.startsWith("https://") && !clean.startsWith("data:")) {
        clean = clean.startsWith("//") ? `https:${clean}` : `https://${clean}`;
      }
      if (!gallery.includes(clean) && !toAdd.includes(clean)) {
        toAdd.push(clean);
      }
    }

    if (toAdd.length > 0) {
      setGallery((prev) => [...prev, ...toAdd]);
      if (!avatar) setAvatar(toAdd[0]);
      setNewPhotoUrl("");
      toast({
        title: isEs ? "Agregado al carrusel" : "Added to carousel",
        description: isEs ? `Se agregaron ${toAdd.length} elemento(s).` : `Added ${toAdd.length} item(s).`
      });
    } else {
      toast({
        description: isEs ? "Esta foto o URL ya está en la galería" : "This photo or URL is already in the gallery"
      });
    }
  };

  // Remove Photo from Gallery
  const handleRemovePhoto = (index: number) => {
    if (gallery.length <= 1) {
      toast({
        description: isEs ? "El personaje debe tener al menos una foto." : "The character must have at least one photo.",
        variant: "destructive"
      });
      return;
    }
    const removed = gallery[index];
    const nextGallery = gallery.filter((_, i) => i !== index);
    setGallery(nextGallery);
    if (avatar === removed) {
      setAvatar(nextGallery[0] || "");
    }
  };

  // Set as Main Avatar
  const handleSetMainAvatar = (url: string) => {
    setAvatar(url);
    toast({ description: isEs ? "Foto o video establecido como avatar principal" : "Set as main profile photo/video" });
  };

  // Save Character
  const handleSave = () => {
    if (!name.trim()) {
      toast({
        description: isEs ? "Por favor escribe un nombre para el personaje" : "Please provide a character name",
        variant: "destructive"
      });
      return;
    }

    const charId = character?.id && !isNew ? character.id : `char-${Date.now()}`;
    const mainAvatar = avatar.trim() || gallery[0] || "https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/6e8f818f9b187d2ebdf4e1d77521e051/3545853885239688145_69992903230.jpg";

    const updated: CharacterItem = {
      id: charId,
      name: name.trim(),
      roleTitle: roleTitle.trim() || (isEs ? "Compañera" : "Partner"),
      roleTitleEn: isEs ? (character?.roleTitleEn || roleTitle.trim()) : roleTitle.trim(),
      roleTitleEs: isEs ? roleTitle.trim() : (character?.roleTitleEs || roleTitle.trim()),
      age: Number(age) || 25,
      gender,
      style,
      avatar: mainAvatar,
      gallery: gallery.length > 0 ? gallery : [mainAvatar],
      bio: bio.trim(),
      bioEn: isEs ? (character?.bioEn || bio.trim()) : bio.trim(),
      bioEs: isEs ? bio.trim() : (character?.bioEs || bio.trim()),
      shortBio: bio.trim().slice(0, 100) + "...",
      shortBioEn: isEs ? (character?.shortBioEn || (bio.trim().slice(0, 100) + "...")) : (bio.trim().slice(0, 100) + "..."),
      shortBioEs: isEs ? (bio.trim().slice(0, 100) + "...") : (character?.shortBioEs || (bio.trim().slice(0, 100) + "...")),
      likesCount: character?.likesCount || "28.4k",
      imageCount: Math.max(gallery.length, character?.imageCount || 120),
      audioCount: character?.audioCount || 85,
      affinityLevel: character?.affinityLevel || 2,
      affinityTitle: character?.affinityTitle || "Curious Flirt",
      affinityXp: character?.affinityXp || 70,
      category: character?.category || "featured",
      starterMessage: starterMessage.trim() || (isEs ? "Hola, me alegra verte. ¿En qué estás pensando?" : "Hey, nice to see you. What's on your mind?"),
      starterMessageEn: isEs ? (character?.starterMessageEn || starterMessage.trim()) : starterMessage.trim(),
      starterMessageEs: isEs ? starterMessage.trim() : (character?.starterMessageEs || starterMessage.trim()),
      voiceName
    };

    // Sync with Insomnia's voice preference helper
    setStoryVoice(charId, voiceName);

    onSave(updated);
    toast({
      title: isNew
        ? (isEs ? "Personaje creado con éxito" : "Character created successfully")
        : (isEs ? "Perfil actualizado" : "Profile updated"),
      description: isEs
        ? `Configuración de ${updated.name} guardada correctamente.`
        : `Settings for ${updated.name} saved successfully.`
    });
    onOpenChange(false);
  };

  const femaleVoices = STORY_VOICES.filter((v) => v.gender === "female");
  const maleVoices = STORY_VOICES.filter((v) => v.gender === "male");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) stopVoicePreview();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-2xl bg-[#0f0f0f] border border-[#272727] text-white p-0 overflow-hidden rounded-3xl shadow-2xl">
        <DialogHeader className="p-6 pb-3 border-b border-[#202020]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#ff8c00]/20 flex items-center justify-center text-[#ff8c00]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-white tracking-wide">
                {isNew
                  ? (isEs ? "Crear Nuevo Personaje de Chat" : "Create New Chat Character")
                  : (isEs ? `Configurar Personaje: ${name || character?.name}` : `Configure Character: ${name || character?.name}`)}
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-400">
                {isEs
                  ? "Personaliza fotos rotativas, síntesis de voz, llamadas y comportamiento de IA."
                  : "Customize rotating photos, speech synthesis, live calls, and AI behavior."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="px-6 border-b border-[#202020] bg-[#141414]">
            <TabsList className="bg-transparent border-0 gap-6 h-12 p-0">
              <TabsTrigger
                value="info"
                className="data-[state=active]:bg-transparent data-[state=active]:text-[#ff8c00] data-[state=active]:border-b-2 data-[state=active]:border-[#ff8c00] rounded-none px-1 h-full font-bold text-xs flex items-center gap-1.5"
              >
                <User className="w-3.5 h-3.5" /> {isEs ? "Información y Rol" : "Info & Role"}
              </TabsTrigger>
              <TabsTrigger
                value="photos"
                className="data-[state=active]:bg-transparent data-[state=active]:text-[#ff8c00] data-[state=active]:border-b-2 data-[state=active]:border-[#ff8c00] rounded-none px-1 h-full font-bold text-xs flex items-center gap-1.5"
              >
                <ImageIcon className="w-3.5 h-3.5" /> {isEs ? `Galería de Fotos (${gallery.length})` : `Photo Gallery (${gallery.length})`}
              </TabsTrigger>
              <TabsTrigger
                value="voice"
                className="data-[state=active]:bg-transparent data-[state=active]:text-[#ff8c00] data-[state=active]:border-b-2 data-[state=active]:border-[#ff8c00] rounded-none px-1 h-full font-bold text-xs flex items-center gap-1.5"
              >
                <Volume2 className="w-3.5 h-3.5" /> {isEs ? "Voz y Llamadas" : "Voice & Calls"}
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="p-6 max-h-[60vh] overflow-y-auto space-y-5">
            {/* TAB 1: INFORMACIÓN BÁSICA */}
            <TabsContent value="info" className="space-y-4 m-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-300 font-semibold">
                    {isEs ? "Nombre del Personaje" : "Character Name"}
                  </Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={isEs ? "Ej. Olivia Adams" : "e.g. Olivia Adams"}
                    className="bg-[#1a1a1a] border-[#2b2b2b] text-sm text-white focus:border-[#ff8c00]"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-300 font-semibold">
                    {isEs ? "Profesión o Título" : "Profession or Title"}
                  </Label>
                  <Input
                    value={roleTitle}
                    onChange={(e) => setRoleTitle(e.target.value)}
                    placeholder={isEs ? "Ej. Nutricionista Prominente" : "e.g. Prominent Nutritionist"}
                    className="bg-[#1a1a1a] border-[#2b2b2b] text-sm text-white focus:border-[#ff8c00]"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-300 font-semibold">
                    {isEs ? "Edad" : "Age"}
                  </Label>
                  <Input
                    type="number"
                    value={age}
                    onChange={(e) => setAge(Number(e.target.value))}
                    min={18}
                    max={80}
                    className="bg-[#1a1a1a] border-[#2b2b2b] text-sm text-white focus:border-[#ff8c00]"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-300 font-semibold">
                    {isEs ? "Estilo Visual" : "Visual Style"}
                  </Label>
                  <Select value={style} onValueChange={(val: any) => setStyle(val)}>
                    <SelectTrigger className="bg-[#1a1a1a] border-[#2b2b2b] text-sm text-white">
                      <SelectValue placeholder={isEs ? "Estilo" : "Style"} />
                    </SelectTrigger>
                    <SelectContent className="bg-[#141414] border-[#2b2b2b] text-white">
                      <SelectItem value="realistic">{isEs ? "Realista / Fotográfico" : "Realistic / Photographic"}</SelectItem>
                      <SelectItem value="anime">{isEs ? "Anime / Ilustración" : "Anime / Illustration"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-300 font-semibold">
                  {isEs ? "Biografía & Personalidad (Contexto para la IA de Chat)" : "Biography & Personality (Context for Chat AI)"}
                </Label>
                <Textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  placeholder={isEs ? "Describe cómo habla, su carácter, secretos o complicidad con el usuario..." : "Describe personality, conversational style, secrets, or affinity..."}
                  className="bg-[#1a1a1a] border-[#2b2b2b] text-sm text-white focus:border-[#ff8c00] leading-relaxed resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-300 font-semibold">
                  {isEs ? "Mensaje Inicial" : "Starter Greeting Message"}
                </Label>
                <Textarea
                  value={starterMessage}
                  onChange={(e) => setStarterMessage(e.target.value)}
                  rows={2}
                  placeholder={isEs ? "Primer mensaje que dirá el personaje al abrir el chat..." : "First message spoken by the character when chat opens..."}
                  className="bg-[#1a1a1a] border-[#2b2b2b] text-sm text-white focus:border-[#ff8c00] resize-none"
                />
              </div>
            </TabsContent>

            {/* TAB 2: GALERÍA DE FOTOS Y VIDEOS (CARRUSEL) */}
            <TabsContent value="photos" className="space-y-6 m-0">
              {/* Inputs ocultos para selección de archivos del equipo */}
              <input
                ref={avatarFileInputRef}
                type="file"
                accept="image/*,video/*,image/gif,.mp4,.webm,.mov"
                className="hidden"
                onChange={handleUploadAvatar}
              />
              <input
                ref={multiFileInputRef}
                type="file"
                multiple
                accept="image/*,video/*,image/gif,.mp4,.webm,.mov"
                className="hidden"
                onChange={handleUploadMultipleFiles}
              />

              {/* Sección 1: Avatar Principal */}
              <div className="p-4 rounded-2xl bg-[#141414] border border-[#262626] space-y-3">
                <div className="flex items-center gap-4">
                  <div className="relative w-16 h-16 rounded-full overflow-hidden ring-2 ring-[#ff8c00] flex-shrink-0 bg-black">
                    {isMediaVideo(avatar || gallery[0]) ? (
                      <video
                        src={avatar || gallery[0]}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src={avatar || gallery[0]}
                        alt="Avatar"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold text-white block">
                      {isEs ? "Avatar Principal (Foto o Video)" : "Main Profile Avatar (Photo or Video)"}
                    </span>
                    <p className="text-[11px] text-zinc-400">
                      {isEs
                        ? "Es la foto o video que aparece en las llamadas y en la lista de conversaciones."
                        : "The photo or video displayed in calls and conversation list."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => avatarFileInputRef.current?.click()}
                    disabled={isUploading}
                    className="bg-[#242424] hover:bg-[#333333] border border-[#3a3a3a] text-zinc-200 hover:text-white text-xs font-bold flex items-center gap-1.5 flex-shrink-0"
                  >
                    <FolderUp className="w-3.5 h-3.5 text-[#ff8c00]" />
                    <span>{isEs ? "Subir del Equipo" : "Upload File"}</span>
                  </Button>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Input
                    value={avatar}
                    onChange={(e) => setAvatar(e.target.value)}
                    placeholder={isEs ? "URL del avatar principal (https://...)" : "Main avatar URL (https://...)"}
                    autoComplete="off"
                    spellCheck={false}
                    className="h-8 bg-[#1a1a1a] border-[#2b2b2b] text-xs text-white focus:border-[#ff8c00] flex-1"
                  />
                  <Button
                    type="button"
                    onClick={() => handlePasteUrl("avatar")}
                    variant="outline"
                    className="h-8 px-2.5 bg-[#181818] border-[#2c2c2c] hover:bg-[#252525] text-zinc-300 text-xs flex items-center gap-1"
                    title={isEs ? "Pegar desde el portapapeles" : "Paste from clipboard"}
                  >
                    <Clipboard className="w-3.5 h-3.5 text-[#ff8c00]" />
                    <span className="hidden sm:inline">{isEs ? "Pegar" : "Paste"}</span>
                  </Button>
                </div>
              </div>

              {/* Sección 2: Subir archivos desde el equipo (Múltiples fotos o videos para el Carrusel) */}
              <div className="space-y-2">
                <Label className="text-xs text-zinc-300 font-bold flex items-center justify-between">
                  <span>{isEs ? "Subir desde tu Computadora / Móvil" : "Upload from your Device"}</span>
                  <span className="text-[11px] text-[#ff8c00] font-normal">
                    {isEs ? "Acepta imágenes, GIFs y videos MP4" : "Accepts images, GIFs, and MP4 videos"}
                  </span>
                </Label>

                <div
                  onClick={() => {
                    if (!isUploading) multiFileInputRef.current?.click();
                  }}
                  className={`p-5 rounded-2xl border-2 border-dashed ${
                    isUploading
                      ? "border-[#ff8c00] bg-[#ff8c00]/5 cursor-wait"
                      : "border-[#ff8c00]/40 hover:border-[#ff8c00] bg-gradient-to-b from-[#181818] to-[#121212] hover:bg-[#1a1a1a] cursor-pointer"
                  } transition-all text-center group shadow-lg`}
                >
                  <div className="flex flex-col items-center gap-2.5">
                    <div className="w-12 h-12 rounded-2xl bg-[#ff8c00]/15 border border-[#ff8c00]/30 text-[#ff8c00] flex items-center justify-center group-hover:scale-110 transition-transform shadow-md">
                      {isUploading ? (
                        <Loader2 className="w-6 h-6 animate-spin text-[#ff8c00]" />
                      ) : (
                        <Upload className="w-6 h-6 stroke-[2.5]" />
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-black text-white tracking-wide">
                        {isUploading ? (
                          uploadProgress ? (
                            <span>{isEs ? "Subiendo archivo" : "Uploading file"} {uploadProgress.current}/{uploadProgress.total}...</span>
                          ) : (
                            <span>{isEs ? "Procesando subida..." : "Processing upload..."}</span>
                          )
                        ) : (
                          <span>{isEs ? "Haz clic para buscar fotos o videos en tu equipo" : "Click to browse photos or videos on your device"}</span>
                        )}
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {isEs
                          ? "Puedes seleccionar varios archivos a la vez para agregarlos al carrusel rotativo."
                          : "You can select multiple files at once to add them to the rotating carousel."}
                      </p>
                    </div>

                    {!isUploading && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ff8c00]/20 text-[#ff8c00] text-[11px] font-extrabold tracking-wide mt-1">
                        <ImagePlus className="w-3.5 h-3.5" />
                        {isEs ? "+ Seleccionar Archivos Locales" : "+ Select Local Files"}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Sección 3: Agregar por Enlace / URL */}
              <div className="space-y-2">
                <Label className="text-xs text-zinc-300 font-semibold">
                  {isEs ? "O Agregar mediante Enlace URL (Imagen, GIF o Video)" : "Or Add via URL Link (Image, GIF, or Video)"}
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={newPhotoUrl}
                    onChange={(e) => setNewPhotoUrl(e.target.value)}
                    placeholder={isEs ? "Pega un enlace https://... (ej. imagen.jpg o video.mp4)" : "Paste https://... link (e.g. image.jpg or video.mp4)"}
                    autoComplete="off"
                    spellCheck={false}
                    className="bg-[#1a1a1a] border-[#2b2b2b] text-xs text-white focus:border-[#ff8c00] flex-1"
                  />
                  <Button
                    type="button"
                    onClick={() => handlePasteUrl("newPhoto")}
                    variant="outline"
                    className="h-10 px-3 bg-[#181818] border-[#2c2c2c] hover:bg-[#252525] text-zinc-300 text-xs flex items-center gap-1"
                    title={isEs ? "Pegar URL del portapapeles" : "Paste URL from clipboard"}
                  >
                    <Clipboard className="w-3.5 h-3.5 text-[#ff8c00]" />
                    <span className="hidden sm:inline">{isEs ? "Pegar" : "Paste"}</span>
                  </Button>
                  <Button
                    type="button"
                    onClick={handleAddPhoto}
                    disabled={!newPhotoUrl.trim()}
                    className="bg-[#ff8c00] hover:bg-amber-500 text-black font-extrabold text-xs flex items-center gap-1.5 px-4"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" /> {isEs ? "Agregar" : "Add"}
                  </Button>
                </div>
              </div>

              {/* Sección 4: Cuadrícula de fotos y videos de la Galería (Carrusel) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-zinc-300 font-semibold">
                    {isEs ? `Fotos y Videos del Carrusel (${gallery.length})` : `Carousel Photos & Videos (${gallery.length})`}
                  </Label>
                  <span className="text-[11px] text-zinc-400">
                    {isEs ? "Usa las flechas en el chat para rotarlas" : "Use arrows in chat to rotate"}
                  </span>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {gallery.map((photo, index) => {
                    const isMain = photo === avatar;
                    const isVideo = isMediaVideo(photo);
                    return (
                      <div
                        key={index}
                        className={`relative group aspect-[3/4] rounded-xl overflow-hidden border ${
                          isMain ? "border-[#ff8c00] ring-2 ring-[#ff8c00]/50" : "border-[#282828]"
                        } bg-[#181818]`}
                      >
                        {isVideo ? (
                          <div className="relative w-full h-full bg-black flex items-center justify-center">
                            <video
                              src={photo}
                              muted
                              playsInline
                              loop
                              autoPlay
                              className="w-full h-full object-cover"
                            />
                            <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-amber-400 text-[9px] font-black uppercase flex items-center gap-1 border border-amber-500/30">
                              <Film className="w-2.5 h-2.5" /> MP4
                            </span>
                          </div>
                        ) : (
                          <img
                            src={photo}
                            alt={`Foto ${index}`}
                            className="w-full h-full object-cover"
                          />
                        )}

                        {/* Badge de principal */}
                        {isMain && (
                          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-[#ff8c00] text-black text-[9px] font-black uppercase shadow-md z-10">
                            {isEs ? "Principal" : "Main"}
                          </span>
                        )}

                        {/* Acciones flotantes al pasar el cursor */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2 z-10">
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(index)}
                            className="self-end w-6 h-6 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center transition-transform hover:scale-110 shadow-lg"
                            title={isEs ? "Eliminar de la galería" : "Delete from gallery"}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>

                          {!isMain && (
                            <button
                              type="button"
                              onClick={() => handleSetMainAvatar(photo)}
                              className="w-full py-1 rounded bg-[#ff8c00] hover:bg-amber-500 text-black text-[10px] font-extrabold transition-colors shadow-md"
                            >
                              {isEs ? "Hacer Principal" : "Set as Main"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>

            {/* TAB 3: VOZ Y LLAMADAS */}
            <TabsContent value="voice" className="space-y-5 m-0">
              <div className="p-4 rounded-2xl bg-[#141414] border border-[#262626] space-y-4">
                <div className="space-y-1">
                  <Label className="text-xs text-zinc-200 font-bold">
                    {isEs ? "Voz de Insomnia para el Chat y Llamadas" : "Insomnia Voice for Chat and Calls"}
                  </Label>
                  <p className="text-[11px] text-zinc-400">
                    {isEs
                      ? "Esta voz se utilizará al reproducir mensajes (▶) y cuando el personaje hable durante una llamada en vivo."
                      : "This voice will be used when playing message audio (▶) and when the character speaks during live calls."}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <Select value={voiceName} onValueChange={(val) => setVoiceName(val)}>
                    <SelectTrigger className="bg-[#1a1a1a] border-[#2b2b2b] text-sm text-white font-semibold">
                      <SelectValue placeholder={isEs ? "Seleccionar voz" : "Select voice"} />
                    </SelectTrigger>
                    <SelectContent className="bg-[#141414] border-[#2b2b2b] text-white max-h-60">
                      <div className="px-2 py-1 text-[10px] font-bold uppercase text-[#ff8c00] tracking-wider">
                        {isEs ? "Voces Femeninas" : "Female Voices"}
                      </div>
                      {femaleVoices.map((v) => (
                        <SelectItem key={v.value} value={v.value} className="text-xs">
                          {v.label} — <span className="text-zinc-400">{isEs ? v.descriptionEs : v.descriptionEn}</span>
                        </SelectItem>
                      ))}
                      <div className="px-2 py-1 text-[10px] font-bold uppercase text-zinc-500 tracking-wider mt-2">
                        {isEs ? "Voces Masculinas" : "Male Voices"}
                      </div>
                      {maleVoices.map((v) => (
                        <SelectItem key={v.value} value={v.value} className="text-xs">
                          {v.label} — <span className="text-zinc-400">{isEs ? v.descriptionEs : v.descriptionEn}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    onClick={handlePreviewVoice}
                    className={`font-extrabold text-xs flex items-center justify-center gap-2 transition-all ${
                      isPlayingVoice
                        ? "bg-red-600 hover:bg-red-500 text-white"
                        : "bg-[#ff8c00] hover:bg-amber-500 text-black shadow-lg shadow-[#ff8c00]/20"
                    }`}
                  >
                    {isPlayingVoice ? (
                      <>
                        <Square className="w-3.5 h-3.5 fill-current" /> {isEs ? "Detener Prueba" : "Stop Preview"}
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" /> {isEs ? "Probar Voz" : "Test Voice"}
                      </>
                    )}
                  </Button>
                </div>

                {/* Info sobre la voz */}
                <div className="p-3 rounded-xl bg-[#0a0a0a] border border-[#202020] flex items-center justify-between text-xs">
                  <span className="text-zinc-400">{isEs ? "Voz seleccionada:" : "Selected voice:"}</span>
                  <span className="text-[#ff8c00] font-bold">
                    {voiceName} ({isEs ? (STORY_VOICES.find((v) => v.value === voiceName)?.descriptionEs || "Femenina") : (STORY_VOICES.find((v) => v.value === voiceName)?.descriptionEn || "Female")})
                  </span>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="p-4 px-6 border-t border-[#202020] bg-[#121212] flex items-center justify-between gap-3">
          {!isNew && onResetHistory ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                stopVoicePreview();
                onResetHistory();
              }}
              className="border-red-900/60 bg-red-950/40 hover:bg-red-900/60 text-red-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5 text-red-400" />
              {isEs ? "Restablecer historia" : "Reset Story"}
            </Button>
          ) : <div />}

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              onClick={() => {
                stopVoicePreview();
                onOpenChange(false);
              }}
              className="text-zinc-400 hover:text-white hover:bg-white/5 text-xs font-semibold"
            >
              {isEs ? "Cancelar" : "Cancel"}
            </Button>

            <Button
              onClick={handleSave}
              className="bg-[#ff8c00] hover:bg-amber-500 text-black font-extrabold text-xs px-6 shadow-lg shadow-[#ff8c00]/30 transition-all hover:scale-105 active:scale-95"
            >
              <Check className="w-4 h-4 stroke-[2.5] mr-1" />
              {isNew ? (isEs ? "Crear Personaje" : "Create Character") : (isEs ? "Guardar Cambios" : "Save Changes")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
