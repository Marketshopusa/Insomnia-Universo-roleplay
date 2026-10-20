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
  Upload,
  Check,
  Sparkles
} from "lucide-react";
import { STORY_VOICES, normalizeStoryVoice, setStoryVoice } from "@/lib/voices";
import { streamSpeech, type SpeechStream } from "@/lib/ttsStream";
import { useLanguage } from "@/contexts/LanguageContext";
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
  bio: string;
  shortBio: string;
  likesCount: string;
  imageCount: number;
  audioCount: number;
  affinityLevel: number;
  affinityTitle: string;
  affinityXp: number;
  category: "featured" | "popular" | "romance" | "spicy";
  starterMessage: string;
  voiceName: string;
}

interface ChatCharacterConfigDialogProps {
  character: CharacterItem | null;
  isNew?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updated: CharacterItem) => void;
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
  onSave
}) => {
  const { language } = useLanguage();
  const isEs = language === "es";

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

  // Add Photo to Gallery
  const handleAddPhoto = () => {
    const trimmed = newPhotoUrl.trim();
    if (!trimmed) return;
    if (gallery.includes(trimmed)) {
      toast({ description: isEs ? "Esta foto ya está en la galería" : "This photo is already in the gallery" });
      return;
    }
    setGallery((prev) => [...prev, trimmed]);
    setNewPhotoUrl("");
    toast({ description: isEs ? "Foto agregada a la galería" : "Photo added to gallery" });
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
    setGallery((prev) => prev.filter((_, i) => i !== index));
  };

  // Set as Main Avatar
  const handleSetMainAvatar = (url: string) => {
    setAvatar(url);
    toast({ description: isEs ? "Foto establecida como avatar principal" : "Set as main profile photo" });
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

            {/* TAB 2: GALERÍA DE FOTOS */}
            <TabsContent value="photos" className="space-y-5 m-0">
              {/* Avatar Principal */}
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-[#141414] border border-[#262626]">
                <div className="relative w-16 h-16 rounded-full overflow-hidden ring-2 ring-[#ff8c00] flex-shrink-0">
                  <img src={avatar || gallery[0]} alt="Avatar" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 space-y-1">
                  <span className="text-xs font-bold text-white">
                    {isEs ? "Avatar Principal" : "Main Profile Avatar"}
                  </span>
                  <p className="text-[11px] text-zinc-400">
                    {isEs
                      ? "Es la foto circular que aparece en las llamadas y en la lista de conversaciones."
                      : "The round photo displayed in calls and conversations list."}
                  </p>
                  <Input
                    value={avatar}
                    onChange={(e) => setAvatar(e.target.value)}
                    placeholder={isEs ? "URL del avatar principal" : "Main avatar image URL"}
                    className="h-8 bg-[#1a1a1a] border-[#2b2b2b] text-xs text-white focus:border-[#ff8c00]"
                  />
                </div>
              </div>

              {/* Agregar Foto */}
              <div className="space-y-2">
                <Label className="text-xs text-zinc-300 font-semibold">
                  {isEs ? "Agregar Nueva Foto a la Galería Rotativa" : "Add New Photo to Rotating Gallery"}
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={newPhotoUrl}
                    onChange={(e) => setNewPhotoUrl(e.target.value)}
                    placeholder={isEs ? "Pega la URL de una imagen (https://...)" : "Paste image URL (https://...)"}
                    className="bg-[#1a1a1a] border-[#2b2b2b] text-xs text-white focus:border-[#ff8c00]"
                  />
                  <Button
                    onClick={handleAddPhoto}
                    disabled={!newPhotoUrl.trim()}
                    className="bg-[#ff8c00] hover:bg-amber-500 text-black font-extrabold text-xs flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" /> {isEs ? "Agregar" : "Add"}
                  </Button>
                </div>
              </div>

              {/* Cuadrícula de fotos existentes */}
              <div className="space-y-2">
                <Label className="text-xs text-zinc-300 font-semibold">
                  {isEs ? `Fotos de la Galería (${gallery.length})` : `Gallery Photos (${gallery.length})`}
                </Label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {gallery.map((photo, index) => {
                    const isMain = photo === avatar;
                    return (
                      <div
                        key={index}
                        className={`relative group aspect-[3/4] rounded-xl overflow-hidden border ${
                          isMain ? "border-[#ff8c00] ring-2 ring-[#ff8c00]/50" : "border-[#282828]"
                        } bg-[#181818]`}
                      >
                        <img src={photo} alt={`Foto ${index}`} className="w-full h-full object-cover" />

                        {/* Badge de principal */}
                        {isMain && (
                          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-[#ff8c00] text-black text-[9px] font-black uppercase">
                            {isEs ? "Principal" : "Main"}
                          </span>
                        )}

                        {/* Acciones flotantes */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
                          <button
                            onClick={() => handleRemovePhoto(index)}
                            className="self-end w-6 h-6 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center transition-transform hover:scale-110"
                            title={isEs ? "Eliminar foto" : "Delete photo"}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>

                          {!isMain && (
                            <button
                              onClick={() => handleSetMainAvatar(photo)}
                              className="w-full py-1 rounded bg-[#ff8c00] hover:bg-amber-500 text-black text-[10px] font-extrabold transition-colors"
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

        <DialogFooter className="p-4 px-6 border-t border-[#202020] bg-[#121212] flex items-center justify-end gap-3">
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
