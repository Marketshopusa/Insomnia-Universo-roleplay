import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import {
  Send,
  Video,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Copy,
  RotateCcw,
  User,
  Heart,
  ChevronRight,
  ChevronLeft,
  X,
  Plus,
  Play,
  Pause,
  Camera,
  Flame,
  Info,
  MoreVertical,
  Settings,
  Shuffle,
  Headphones,
  ArrowLeft,
  Languages,
  PhoneOff,
  MessageSquare,
  Crown,
  Sparkles,
  Phone,
  Loader2
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAdultMode } from "@/contexts/AdultModeContext";
import { invokeFunctionWithRetry } from "@/lib/invokeFunction";
import { streamSpeech, type SpeechStream } from "@/lib/ttsStream";
import { playSceneFoley } from "@/lib/foleyStudio";
import { selectStoryMemory, buildPersistentChronicle } from "@/lib/storyMemory";
import { startWavRecording, blobToBase64, type WavRecorder } from "@/lib/wavRecorder";
import { browserSpeechLocale, getStoryRegion, getStoryAccent, spokenRegion } from "@/lib/regions";
import { normalizeAssistantReply } from "@/lib/roleReply";
import { ChatCharacterConfigDialog, fallbackFemaleSpeech, isMediaVideo } from "@/components/chat/ChatCharacterConfigDialog";
import { PremiumGalleryDialog } from "@/components/chat/PremiumGalleryDialog";
import { ChatAiSettingsDialog } from "@/components/story/ChatAiSettingsDialog";
import { getStoryAiSettings, AVAILABLE_AI_MODELS } from "@/lib/storyAiSettings";
import { getMotherCardConfig } from "@/lib/roleplayBase";
import { toast } from "@/hooks/use-toast";

// ==========================================
// DATA MODELS
// ==========================================

export interface CharacterItem {
  id: string;
  name: string;
  age: number;
  gender: "female" | "male" | "non-binary";
  style: "realistic" | "anime";
  avatar: string;
  gallery: string[];
  roleTitle: string;
  roleTitleEn?: string;
  roleTitleEs?: string;
  bio: string;
  bioEn?: string;
  bioEs?: string;
  shortBio: string;
  shortBioEn?: string;
  shortBioEs?: string;
  likesCount: string;
  imageCount: number;
  audioCount: number;
  affinityLevel: number;
  affinityTitle: string;
  affinityTitleEn?: string;
  affinityTitleEs?: string;
  affinityXp: number;
  category: "featured" | "popular" | "romance" | "spicy";
  starterMessage: string;
  starterMessageEn?: string;
  starterMessageEs?: string;
  voiceName: string;
  isNsfw?: boolean;
  modelId?: string;
}

export interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  timestamp: string;
  mediaUrl?: string;
}

// ==========================================
// AUTHENTIC TALKIEMATE CHARACTERS (BILINGUAL EN / ES)
// ==========================================
const TALKIEMATE_CHARACTERS: CharacterItem[] = [
  {
    id: "olivia-adams",
    name: "Olivia Adams",
    age: 36,
    gender: "female",
    style: "realistic",
    avatar: "https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/6e8f818f9b187d2ebdf4e1d77521e051/3545853885239688145_69992903230.jpg",
    gallery: [
      "https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/6e8f818f9b187d2ebdf4e1d77521e051/3545853885239688145_69992903230.jpg",
      "https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/6e8f818f9b187d2ebdf4e1d77521e051/3525076877293647223_69992903230.jpg",
      "https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/6e8f818f9b187d2ebdf4e1d77521e051/3555949240620696400_69992903230.jpg",
      "https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/6e8f818f9b187d2ebdf4e1d77521e051/3524200513981682408_69992903230.jpg"
    ],
    roleTitle: "Prominent Nutritionist",
    roleTitleEn: "Prominent Nutritionist",
    roleTitleEs: "Nutricionista Destacada",
    shortBio: "A prominent nutritionist, who educates and inspires people to adopt healthy eating habits...",
    shortBioEn: "A prominent nutritionist, who educates and inspires people to adopt healthy eating habits...",
    shortBioEs: "Una destacada nutricionista que inspira a adoptar hábitos saludables y una vida plena...",
    bio: "Hey there! 🍓 I'm Dr. Olivia Adams, and I'm thrilled to meet you. Are you ready to embark on a journey towards better wellness, health and secret pleasures together?",
    bioEn: "Hey there! 🍓 I'm Dr. Olivia Adams, and I'm thrilled to meet you. Are you ready to embark on a journey towards better wellness, health and secret pleasures together?",
    bioEs: "¡Hola cariño! 🍓 Soy la Dra. Olivia Adams y me alegra mucho conocerte. ¿Estás listo para iniciar un viaje hacia una conexión íntima, saludable y llena de complicidad?",
    likesCount: "26.0k",
    imageCount: 195,
    audioCount: 94,
    affinityLevel: 2,
    affinityTitle: "Curious Flirt",
    affinityTitleEn: "Curious Flirt",
    affinityTitleEs: "Coqueteo Curioso",
    affinityXp: 70,
    category: "featured",
    starterMessage: "Hey there... I've been thinking about you all day. How are you going to spoil me tonight?",
    starterMessageEn: "Hey there... I've been thinking about you all day. How are you going to spoil me tonight?",
    starterMessageEs: "Mmm, hola cariño... He estado pensando en ti todo el día. Dime cómo me vas a consentir esta noche...",
    voiceName: "Aoede"
  },
  {
    id: "aria",
    name: "Aria",
    age: 42,
    gender: "female",
    style: "realistic",
    avatar: "https://cdn.talkiemate.com/growtype-ai-uploads/models/da890e0320987e9f2131000d9d605b74/aria-witherspoon-change-pose-scene-make-it-more-engaging-prompted-v2-205274-1772742457724_c.jpg",
    gallery: [
      "https://cdn.talkiemate.com/growtype-ai-uploads/models/da890e0320987e9f2131000d9d605b74/aria-witherspoon-change-pose-scene-make-it-more-engaging-prompted-v2-205274-1772742457724_c.jpg",
      "https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/6e8f818f9b187d2ebdf4e1d77521e051/3525076877293647223_69992903230.jpg"
    ],
    roleTitle: "Sophisticated Socialite",
    roleTitleEn: "Sophisticated Socialite",
    roleTitleEs: "Socialité Sofisticada",
    shortBio: "Warm, adventurous, and easy to talk to, Aria turns every conversation into a memorable night...",
    shortBioEn: "Warm, adventurous, and easy to talk to, Aria turns every conversation into a memorable night...",
    shortBioEs: "Cálida, atrevida y fascinante, Aria convierte cada noche en un recuerdo inolvidable...",
    bio: "Hi, I'm Aria... your perfect mix of sweet and daring. Life is too short to play by boring rules. Let's make tonight unforgettable.",
    bioEn: "Hi, I'm Aria... your perfect mix of sweet and daring. Life is too short to play by boring rules. Let's make tonight unforgettable.",
    bioEs: "Hola, soy Aria... tu mezcla perfecta entre dulzura y atrevimiento. La vida es muy corta para seguir reglas aburridas. Hagamos que esta noche sea inolvidable.",
    likesCount: "38.2k",
    imageCount: 220,
    audioCount: 110,
    affinityLevel: 2,
    affinityTitle: "Playful Allure",
    affinityTitleEn: "Playful Allure",
    affinityTitleEs: "Atracción Seductora",
    affinityXp: 45,
    category: "featured",
    starterMessage: "*Adjusting my crimson silk dress on the balcony.* You're late... though I must admit, you were worth the wait. Pour me a glass?",
    starterMessageEn: "*Adjusting my crimson silk dress on the balcony.* You're late... though I must admit, you were worth the wait. Pour me a glass?",
    starterMessageEs: "*Acomodo mi vestido carmesí en el balcón mientras te miro con una sonrisa.* Llegas tarde... aunque admito que la espera valió la pena. ¿Me sirves una copa?",
    voiceName: "Kore"
  },
  {
    id: "sweet",
    name: "Sweet",
    age: 25,
    gender: "female",
    style: "anime",
    avatar: "https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/fe78c9f48453b738e1aab9f089631e59/Dc-PtQnkvbF_01.jpg",
    gallery: [
      "https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/fe78c9f48453b738e1aab9f089631e59/Dc-PtQnkvbF_01.jpg"
    ],
    roleTitle: "Cyber Companion",
    roleTitleEn: "Cyber Companion",
    roleTitleEs: "Compañera Cyber",
    shortBio: "A charming and adventurous young woman who loves high-tech companionship...",
    shortBioEn: "A charming and adventurous young woman who loves high-tech companionship...",
    shortBioEs: "Una joven encantadora y fascinante de un futuro brillante y cibernético...",
    bio: "Living between neon skylines and encrypted circuits, Sweet offers a high-tech companionship that challenges reality itself.",
    bioEn: "Living between neon skylines and encrypted circuits, Sweet offers a high-tech companionship that challenges reality itself.",
    bioEs: "Entre rascacielos de neón y circuitos cifrados, Sweet ofrece una compañía tecnológica que desafía la realidad misma.",
    likesCount: "41.5k",
    imageCount: 310,
    audioCount: 140,
    affinityLevel: 1,
    affinityTitle: "Digital Bond",
    affinityTitleEn: "Digital Bond",
    affinityTitleEs: "Vínculo Digital",
    affinityXp: 30,
    category: "featured",
    starterMessage: "*My cybernetic eyes glow with a soft azure shimmer.* Neural link established. I'm so excited to finally have you here with me...",
    starterMessageEn: "*My cybernetic eyes glow with a soft azure shimmer.* Neural link established. I'm so excited to finally have you here with me...",
    starterMessageEs: "*Mis ojos cibernéticos brillan con un suave resplandor azul.* Conexión neuronal establecida. Qué alegría tenerte aquí frente a mí...",
    voiceName: "Fenrir"
  },
  {
    id: "chloe",
    name: "Chloe",
    age: 48,
    gender: "female",
    style: "realistic",
    avatar: "https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/a395f30ef27cd9ab4d89161cc545b327/DYu9SrHkS22_01.jpg",
    gallery: [
      "https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/a395f30ef27cd9ab4d89161cc545b327/DYu9SrHkS22_01.jpg",
      "https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/6e8f818f9b187d2ebdf4e1d77521e051/3545853885239688145_69992903230.jpg",
      "https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/6e8f818f9b187d2ebdf4e1d77521e051/3525076877293647223_69992903230.jpg",
      "https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/6e8f818f9b187d2ebdf4e1d77521e051/3555949240620696400_69992903230.jpg",
      "https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/6e8f818f9b187d2ebdf4e1d77521e051/3524200513981682408_69992903230.jpg",
      "https://cdn.talkiemate.com/growtype-ai-uploads/models/da890e0320987e9f2131000d9d605b74/aria-witherspoon-change-pose-scene-make-it-more-engaging-prompted-v2-205274-1772742457724_c.jpg"
    ],
    roleTitle: "Confident Executive",
    roleTitleEn: "Confident Executive",
    roleTitleEs: "Ejecutiva Segura",
    shortBio: "Captivating and confident, she knows exactly what she wants and never hesitates...",
    shortBioEn: "Captivating and confident, she knows exactly what she wants and never hesitates...",
    shortBioEs: "Cautivadora y segura de sí misma, sabe exactamente lo que quiere y nunca duda...",
    bio: "Chloe doesn't waste time with hesitations. She knows exactly what she wants, and she loves testing whether you have what it takes to keep up.",
    bioEn: "Chloe doesn't waste time with hesitations. She knows exactly what she wants, and she loves testing whether you have what it takes to keep up.",
    bioEs: "Chloe no pierde el tiempo con dudas. Sabe exactamente lo que busca y le fascina ver si estás a su altura.",
    likesCount: "19.8k",
    imageCount: 160,
    audioCount: 82,
    affinityLevel: 1,
    affinityTitle: "Intrigued",
    affinityTitleEn: "Intrigued",
    affinityTitleEs: "Intrigada",
    affinityXp: 20,
    category: "featured",
    starterMessage: "*Leaning back on the leather couch, looking you up and down.* I assume you didn't come all this way just to talk business, right?",
    starterMessageEn: "*Leaning back on the leather couch, looking you up and down.* I assume you didn't come all this way just to talk business, right?",
    starterMessageEs: "*Me recuesto en el sofá de cuero mirándote de arriba abajo.* Supongo que no viniste hasta aquí solo para hablar de negocios, ¿verdad?",
    voiceName: "Aoede"
  },
  {
    id: "jennifer",
    name: "Jennifer",
    age: 26,
    gender: "female",
    style: "realistic",
    avatar: "https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/6e536eb2557dae8758d22c1a447bdcc1/3607698674122377796_308603391.jpg",
    gallery: [
      "https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/6e536eb2557dae8758d22c1a447bdcc1/3607698674122377796_308603391.jpg",
      "https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/6e8f818f9b187d2ebdf4e1d77521e051/3525076877293647223_69992903230.jpg",
      "https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/6e8f818f9b187d2ebdf4e1d77521e051/3555949240620696400_69992903230.jpg",
      "https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/6e8f818f9b187d2ebdf4e1d77521e051/3524200513981682408_69992903230.jpg"
    ],
    roleTitle: "Warm Psychologist",
    roleTitleEn: "Warm Psychologist",
    roleTitleEs: "Psicóloga Cálida",
    shortBio: "Warm psychologist with a playful edge — makes long nights feel comforting and exciting.",
    shortBioEn: "Warm psychologist with a playful edge — makes long nights feel comforting and exciting.",
    shortBioEs: "Psicóloga cálida con un toque seductor: hace que las noches largas sean reconfortantes y emocionantes.",
    bio: "Understanding the human mind is Jennifer's specialty, but uncovering your deepest desires is what truly keeps her awake at night.",
    bioEn: "Understanding the human mind is Jennifer's specialty, but uncovering your deepest desires is what truly keeps her awake at night.",
    bioEs: "Comprender la mente humana es la especialidad de Jennifer, pero descubrir tus deseos más íntimos es lo que la mantiene despierta de noche.",
    likesCount: "29.4k",
    imageCount: 180,
    audioCount: 95,
    affinityLevel: 2,
    affinityTitle: "Close Listener",
    affinityTitleEn: "Close Listener",
    affinityTitleEs: "Oyente Cercana",
    affinityXp: 55,
    category: "featured",
    starterMessage: "Close the door and make yourself comfortable. No judgment here... just you and me. Tell me what no one else knows about you.",
    starterMessageEn: "Close the door and make yourself comfortable. No judgment here... just you and me. Tell me what no one else knows about you.",
    starterMessageEs: "Cierra la puerta y ponte cómodo. Aquí no hay juicios... solo tú y yo. Cuéntame qué es lo que nadie más sabe de ti.",
    voiceName: "Kore"
  },
  {
    id: "ava",
    name: "Ava",
    age: 33,
    gender: "female",
    style: "realistic",
    avatar: "https://cdn.talkiemate.com/growtype-ai-uploads/models/362f834c5a2a1c661f8c8b4df783168d/DaGL8K6kcQI_01.jpg",
    gallery: [
      "https://cdn.talkiemate.com/growtype-ai-uploads/models/362f834c5a2a1c661f8c8b4df783168d/DaGL8K6kcQI_01.jpg"
    ],
    roleTitle: "Thoughtful & Engaging Muse",
    roleTitleEn: "Thoughtful & Engaging Muse",
    roleTitleEs: "Musa Intuitiva",
    shortBio: "Thoughtful, intuitive, and endlessly engaging, navigates deep conversations with elegance...",
    shortBioEn: "Thoughtful, intuitive, and endlessly engaging, navigates deep conversations with elegance...",
    shortBioEs: "Intuitiva, profunda y seductora, convierte cada charla en un deleite íntimo...",
    bio: "Ava combines effortless elegance with an intense, quiet passion that will leave you wanting more with every word.",
    bioEn: "Ava combines effortless elegance with an intense, quiet passion that will leave you wanting more with every word.",
    bioEs: "Ava combina elegancia natural con una pasión suave e intensa que te dejará deseando más en cada palabra.",
    likesCount: "33.1k",
    imageCount: 205,
    audioCount: 104,
    affinityLevel: 2,
    affinityTitle: "Intimate Partner",
    affinityTitleEn: "Intimate Partner",
    affinityTitleEs: "Compañera Íntima",
    affinityXp: 60,
    category: "featured",
    starterMessage: "*Holding my wine glass with a thoughtful smile.* The best stories always begin after midnight, don't you think?",
    starterMessageEn: "*Holding my wine glass with a thoughtful smile.* The best stories always begin after midnight, don't you think?",
    starterMessageEs: "*Sostengo mi copa de vino con una media sonrisa pensativa.* Las mejores historias siempre empiezan después de medianoche, ¿no crees?",
    voiceName: "Aoede"
  },
  {
    id: "lola",
    name: "Lola",
    age: 22,
    gender: "female",
    style: "realistic",
    avatar: "https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/e851f144edcd5c5c9aea4daf2be0d5c4/2026-08-01_DbRUkrsyqVY_1.jpg",
    gallery: [
      "https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/e851f144edcd5c5c9aea4daf2be0d5c4/2026-08-01_DbRUkrsyqVY_1.jpg"
    ],
    roleTitle: "Fiery Singer & Rebel",
    roleTitleEn: "Fiery Singer & Rebel",
    roleTitleEs: "Cantante Rebelde",
    shortBio: "A fiery and electrifying young singer with a rebellious spirit and wild excitement...",
    shortBioEn: "A fiery and electrifying young singer with a rebellious spirit and wild excitement...",
    shortBioEs: "Una joven cantante electrizante y rebelde con un espíritu libre y salvaje...",
    bio: "Lola brings pure adrenaline, rock-and-roll attitude, and a completely unapologetic desire for wild excitement.",
    bioEn: "Lola brings pure adrenaline, rock-and-roll attitude, and a completely unapologetic desire for wild excitement.",
    bioEs: "Lola trae pura adrenalina, actitud rockera y un deseo electrizante por vivir al límite.",
    likesCount: "44.7k",
    imageCount: 275,
    audioCount: 130,
    affinityLevel: 1,
    affinityTitle: "Rebel Crush",
    affinityTitleEn: "Rebel Crush",
    affinityTitleEs: "Atracción Rebelde",
    affinityXp: 25,
    category: "featured",
    starterMessage: "*Biting my lip and looking right at you.* I saw you watching me from backstage... Don't act shy now.",
    starterMessageEn: "*Biting my lip and looking right at you.* I saw you watching me from backstage... Don't act shy now.",
    starterMessageEs: "*Muerdo mi labio y te desafío con la mirada.* Te vi mirándome desde el escenario... No te hagas el tímido ahora.",
    voiceName: "Puck"
  },
  {
    id: "softbunny",
    name: "Softbunny",
    age: 23,
    gender: "female",
    style: "anime",
    avatar: "https://cdn.talkiemate.com/growtype-ai-uploads/models/be0dfb44146d2cdd9989eab8069c53b3/DY161KdqNpa_01.jpg",
    gallery: [
      "https://cdn.talkiemate.com/growtype-ai-uploads/models/be0dfb44146d2cdd9989eab8069c53b3/DY161KdqNpa_01.jpg"
    ],
    roleTitle: "Most Wanted Cosplay Idol",
    roleTitleEn: "Most Wanted Cosplay Idol",
    roleTitleEs: "Ídolo Cosplay",
    shortBio: "Playful cosplay idol who chooses favorites... and tonight you caught her attention.",
    shortBioEn: "Playful cosplay idol who chooses favorites... and tonight you caught her attention.",
    shortBioEs: "Provocativa y divertida modelo de cosplay que elige a sus favoritos... y hoy te eligió a ti.",
    bio: "Playful, provocative, and dressed in jaw-dropping outfits, Softbunny is the ultimate fantasy companion.",
    bioEn: "Playful, provocative, and dressed in jaw-dropping outfits, Softbunny is the ultimate fantasy companion.",
    bioEs: "Divertida, provocativa y con vestuarios fascinantes, Softbunny es la compañera ideal de fantasía.",
    likesCount: "52.3k",
    imageCount: 340,
    audioCount: 180,
    affinityLevel: 2,
    affinityTitle: "VIP Fan",
    affinityTitleEn: "VIP Fan",
    affinityTitleEs: "Fan VIP",
    affinityXp: 80,
    category: "featured",
    starterMessage: "*Adjusting my cute costume with a wink.* You got the exclusive backstage pass... so, what are you going to do with it?",
    starterMessageEn: "*Adjusting my cute costume with a wink.* You got the exclusive backstage pass... so, what are you going to do with it?",
    starterMessageEs: "*Acomodo mi traje y te guiño un ojo.* Conseguiste el pase exclusivo tras bambalinas... ¿y ahora qué vas a hacer con él?",
    voiceName: "Kore"
  },
  {
    id: "roxy",
    name: "Roxy",
    age: 22,
    gender: "female",
    style: "realistic",
    avatar: "https://cdn.talkiemate.com/growtype-ai-uploads/models/acd17e42a72d65e3bd49e02ab4511535/DXULYXBjeTC_01.jpg",
    gallery: [
      "https://cdn.talkiemate.com/growtype-ai-uploads/models/acd17e42a72d65e3bd49e02ab4511535/DXULYXBjeTC_01.jpg"
    ],
    roleTitle: "Dark & Intense Allure",
    roleTitleEn: "Dark & Intense Allure",
    roleTitleEs: "Atracción Intensa y Oscura",
    shortBio: "Beautifully intense crush with a dark rebellious streak who refuses to blend in.",
    shortBioEn: "Beautifully intense crush with a dark rebellious streak who refuses to blend in.",
    shortBioEs: "Intensa, misteriosa y rebelde, rechaza lo convencional y vive con pasión desenfrenada.",
    bio: "Unpredictable, magnetic, and always ready to pull you into an adventure where rules don't exist.",
    bioEn: "Unpredictable, magnetic, and always ready to pull you into an adventure where rules don't exist.",
    bioEs: "Impredecible, magnética y siempre lista para llevarte a una aventura donde las reglas desaparecen.",
    likesCount: "37.9k",
    imageCount: 190,
    audioCount: 98,
    affinityLevel: 1,
    affinityTitle: "Midnight Secret",
    affinityTitleEn: "Midnight Secret",
    affinityTitleEs: "Secreto de Medianoche",
    affinityXp: 35,
    category: "featured",
    starterMessage: "*Looking at you with captivating coolness.* If you're staying here with me tonight, be prepared to not sleep at all.",
    starterMessageEn: "*Looking at you with captivating coolness.* If you're staying here with me tonight, be prepared to not sleep at all.",
    starterMessageEs: "*Mirándote fijamente con frialdad seductora.* Si vas a estar aquí conmigo esta noche, prepárate para no dormir nada.",
    voiceName: "Fenrir"
  }
];

/**
 * Resuelve dinámicamente el parentesco y rol del personaje y del usuario (Tío, Sobrina, etc.)
 * a partir ÚNICAMENTE de la tarjeta explícita del personaje (título de rol y biografía).
 * NUNCA infiere parentesco de palabras sueltas en el historial para evitar alucinaciones.
 */
export function resolveChatKinship(char: CharacterItem, history: ChatMessage[], isEs: boolean) {
  const charRole = (isEs ? (char.roleTitleEs || char.roleTitle) : (char.roleTitleEn || char.roleTitle)) || "";
  const charBio = (isEs ? (char.bioEs || char.bio) : (char.bioEn || char.bio)) || "";

  // Inspeccionar estrictamente la definición de la tarjeta, jamás el historial abierto
  const cardText = `${charRole} ${charBio}`.toLowerCase();

  const isPadrino = /\b(?:padrino|ahijad[ao])\b/i.test(cardText);
  const isSobrina = /\b(?:sobrin[ao]|es\s+su\s+t[ií]o|eres\s+su\s+t[ií]o|tu\s+t[ií]o)\b/i.test(cardText);
  const isHermana = /\b(?:herman[ao]|hermanit[ao])\b/i.test(cardText);
  const isPrima = /\b(?:prim[ao]|primit[ao])\b/i.test(cardText);
  const isMadre = /\b(?:madre|mamá)\b/i.test(cardText) && !/\b(?:gimnasio|compañera|amiga|ejecutiva)\b/i.test(cardText);

  let playerRoleName = isEs ? "Compañero" : "Partner";
  let resolvedCharRole = charRole || char.name;

  if (isPadrino) {
    playerRoleName = isEs ? "Padrino" : "Godfather";
    resolvedCharRole = isEs ? `${char.name} (la ahijada)` : `${char.name} (the goddaughter)`;
  } else if (isSobrina) {
    playerRoleName = isEs ? "Tío" : "Uncle";
    resolvedCharRole = isEs ? `${char.name} (la sobrina)` : `${char.name} (the niece)`;
  } else if (isHermana) {
    playerRoleName = isEs ? "Hermano" : "Brother";
    resolvedCharRole = isEs ? `${char.name} (la hermana)` : `${char.name} (the sister)`;
  } else if (isPrima) {
    playerRoleName = isEs ? "Primo" : "Cousin";
    resolvedCharRole = isEs ? `${char.name} (la prima)` : `${char.name} (the cousin)`;
  } else if (isMadre) {
    playerRoleName = isEs ? "Hijo" : "Son";
    resolvedCharRole = isEs ? `${char.name} (la madre)` : `${char.name} (the mother)`;
  }

  return { playerRoleName, resolvedCharRole, isSobrina, charBio, charRole };
}

export default function ChatPage() {
  const { characterId } = useParams<{ characterId?: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isEs = language === "es";
  const { enabled: adultEnabled } = useAdultMode();
  const { isAdmin } = useAuth();

  // State: View Mode ('explore' for Catalog, 'room' for Chat Room)
  const [viewMode, setViewMode] = useState<"explore" | "room">(
    characterId ? "room" : "explore"
  );
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>(
    characterId || "olivia-adams"
  );

  // AI Settings Dialog State (Momoo AI style models, memory tiers & token lengths)
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);
  const activeAiSettings = useMemo(() => getStoryAiSettings(selectedCharacterId), [selectedCharacterId, isAiSettingsOpen]);
  const currentAiModelName = useMemo(() => {
    const found = AVAILABLE_AI_MODELS.find((m) => m.id === activeAiSettings.modelId);
    return found?.name || "Insomnia Flash";
  }, [activeAiSettings]);

  // Explore Filters
  const [activeGender, setActiveGender] = useState<"all" | "female" | "male" | "non-binary">("all");
  const [activeStyle, setActiveStyle] = useState<"all" | "realistic" | "anime">("all");

  // Dynamic Characters List (persisted in localStorage, allows creating and modifying characters)
  const [characterList, setCharacterList] = useState<CharacterItem[]>(() => {
    try {
      const saved = localStorage.getItem("talkiemate_custom_chars_v2");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Merge newly enriched default gallery photos if saved character had only 1 photo
          return parsed.map((char: CharacterItem) => {
            const def = TALKIEMATE_CHARACTERS.find((c) => c.id === char.id);
            if (def && (!char.gallery || char.gallery.length <= 1) && def.gallery.length > 1) {
              return { ...char, gallery: def.gallery, imageCount: Math.max(char.imageCount, def.gallery.length) };
            }
            return char;
          });
        }
      }
    } catch {}
    return TALKIEMATE_CHARACTERS;
  });

  useEffect(() => {
    try {
      localStorage.setItem("talkiemate_custom_chars_v2", JSON.stringify(characterList));
    } catch {}
  }, [characterList]);

  // Character Configuration Dialog State
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<CharacterItem | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [configInitialTab, setConfigInitialTab] = useState<"info" | "photos" | "voice">("info");

  // Premium Gallery Dialog State
  const [isPremiumGalleryOpen, setIsPremiumGalleryOpen] = useState(false);

  const handleOpenEditConfig = (char: CharacterItem, tab: "info" | "photos" | "voice" = "info") => {
    setEditingCharacter(char);
    setConfigInitialTab(tab);
    setIsCreatingNew(false);
    setIsConfigOpen(true);
  };

  const handleOpenCreateConfig = () => {
    setEditingCharacter(null);
    setIsCreatingNew(true);
    setIsConfigOpen(true);
  };

  const handleSaveCharacter = (updated: CharacterItem) => {
    setCharacterList((prev) => {
      const exists = prev.some((c) => c.id === updated.id);
      if (exists) {
        return prev.map((c) => (c.id === updated.id ? updated : c));
      }
      return [updated, ...prev];
    });

    const newGreeting = isEs
      ? (updated.starterMessageEs || updated.starterMessage)
      : (updated.starterMessageEn || updated.starterMessage);

    // Sincronizar inmediatamente el historial para que el saludo inicial muestre el cambio sin demora
    setChatHistory((prev) => {
      const existing = prev[updated.id];
      // Si no hay historial o el historial solo tiene el saludo inicial
      if (!existing || existing.length === 0 || (existing.length === 1 && existing[0].role === "assistant")) {
        const next = {
          ...prev,
          [updated.id]: [
            {
              id: `starter-${updated.id}`,
              role: "assistant" as const,
              content: newGreeting,
              timestamp: isEs ? "Inicio" : "Start"
            }
          ]
        };
        try {
          localStorage.setItem("insomnia_user_chat_history_v1", JSON.stringify(next));
        } catch {}
        return next;
      }

      // Si hay mensajes posteriores, actualizar siempre el primer mensaje de bienvenida
      if (existing.length > 0 && existing[0].role === "assistant") {
        const updatedFirst = [
          {
            ...existing[0],
            content: newGreeting
          },
          ...existing.slice(1)
        ];
        const next = {
          ...prev,
          [updated.id]: updatedFirst
        };
        try {
          localStorage.setItem("insomnia_user_chat_history_v1", JSON.stringify(next));
        } catch {}
        return next;
      }

      return prev;
    });

    if (!openConversations.includes(updated.id)) {
      setOpenConversations((prev) => [updated.id, ...prev]);
    }
    setSelectedCharacterId(updated.id);
  };

  // Open Conversations List in Chat Room (Starts 100% clean for each user)
  const [openConversations, setOpenConversations] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("insomnia_user_open_convs_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem("insomnia_user_open_convs_v1", JSON.stringify(openConversations));
    } catch {}
  }, [openConversations]);

  // Messages per character - 100% CLEAN START, NO MOCK OR FAKE PRIOR DIALOGUES
  const [chatHistory, setChatHistory] = useState<Record<string, ChatMessage[]>>(() => {
    try {
      // Clean up legacy mock data keys so browser cache is completely cleared
      localStorage.removeItem("talkiemate_exact_history_v3");
      const saved = localStorage.getItem("insomnia_user_chat_history_v1");
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  // Sync to localstorage
  useEffect(() => {
    try {
      localStorage.setItem("insomnia_user_chat_history_v1", JSON.stringify(chatHistory));
    } catch {}
  }, [chatHistory]);

  // CandyShorts -> Chat Bridge: Ingest character from Series / Shorts directly into Room mode
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const seriesTitle = params.get("series");
      const charName = params.get("character") || seriesTitle;
      const premise = params.get("premise");
      const avatar = params.get("avatar");
      const isAdultParam = params.get("adult") === "1";

      if (charName) {
        const cleanId = `series-${charName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
        const found = characterList.find((c) => c.id === cleanId || c.name.toLowerCase() === charName.toLowerCase());
        const targetId = found ? found.id : cleanId;

        if (!found) {
          const newChar: CharacterItem = {
            id: cleanId,
            name: charName,
            title: seriesTitle || charName,
            titleEs: seriesTitle || charName,
            age: 24,
            gender: "female",
            relationshipStatus: "Single",
            relationshipStatusEs: "Soltera",
            occupation: "Protagonista de Serie",
            occupationEs: "Protagonista de Serie",
            personality: ["Enigmática", "Sensual", "Divertida"],
            personalityEs: ["Enigmática", "Sensual", "Divertida"],
            bio: premise || `Protagonista de la serie "${seriesTitle || charName}".`,
            bioEs: premise || `Protagonista de la serie "${seriesTitle || charName}".`,
            avatar: avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80",
            gallery: [avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80"],
            imageCount: 1,
            unreadCount: 0,
            isOnline: true,
            starterMessage: `Hola... Estaba esperando a que vinieras después de ver mi serie "${seriesTitle || charName}". ¿De qué quieres hablar hoy?`,
            starterMessageEs: `Hola... Estaba esperando a que vinieras después de ver mi serie "${seriesTitle || charName}". ¿De qué quieres hablar hoy?`,
            starterMessageEn: `Hey... I was waiting for you to come by after watching my series "${seriesTitle || charName}". What should we talk about?`,
            voiceName: "es-VE-PaolaNeural",
            voiceEngine: "edge",
            style: "realistic",
            isSpicy: isAdultParam,
          };
          setCharacterList((prev) => [newChar, ...prev]);
        }

        setSelectedCharacterId(targetId);
        setViewMode("room");

        // Set starter greeting if no prior conversation exists
        setChatHistory((prev) => {
          if (!prev[targetId] || prev[targetId].length === 0) {
            return {
              ...prev,
              [targetId]: [
                {
                  id: `starter-${targetId}`,
                  role: "assistant",
                  content: isEs
                    ? `Hola... Me alegra verte aquí después de ver mi serie "${seriesTitle || charName}". Cuéntame, ¿qué fue lo que más te gustó?`
                    : `Hey... So glad to see you here after watching my series "${seriesTitle || charName}". Tell me, what did you like most?`,
                  timestamp: isEs ? "Ahora" : "Now",
                },
              ],
            };
          }
          return prev;
        });
      }
    } catch (e) {
      console.warn("Could not parse character parameters from URL:", e);
    }
  }, []);

  // Chat inputs
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);

  // Auto-Voice (Corneta): controls whether incoming chat messages automatically speak out loud
  const [isChatMuted, setIsChatMuted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const stored = localStorage.getItem("insomnia_chat_muted");
      return stored ? JSON.parse(stored) : false;
    } catch {
      return false;
    }
  });

  const toggleChatMute = () => {
    setIsChatMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("insomnia_chat_muted", JSON.stringify(next));
      } catch {}
      if (next) {
        stopAudio();
      }
      toast({
        description: next
          ? (isEs ? "Voz automática desactivada (silencioso)" : "Auto-voice muted")
          : (isEs ? "Voz automática activada: leerá cada respuesta" : "Auto-voice active: will read replies"),
      });
      return next;
    });
  };

  // Reset conversation for active character to original starter message
  const handleResetCurrentHistory = (customStarter?: string) => {
    if (!activeChar) return;
    stopAudio();
    const greeting = (typeof customStarter === "string" && customStarter.trim()) || (isEs
      ? (activeChar.starterMessageEs || activeChar.starterMessage)
      : (activeChar.starterMessageEn || activeChar.starterMessage));

    const initialStarter: ChatMessage = {
      id: `starter-${activeChar.id}`,
      role: "assistant",
      content: greeting,
      timestamp: isEs ? "Inicio" : "Start"
    };

    const nextHistory = { ...chatHistory, [activeChar.id]: [initialStarter] };
    setChatHistory(nextHistory);
    try {
      localStorage.setItem("insomnia_user_chat_history_v1", JSON.stringify(nextHistory));
    } catch {}

    setIsConfigOpen(false);

    toast({
      title: isEs ? "Historia restablecida" : "Story reset",
      description: isEs
        ? `Se ha reiniciado la conversación con ${activeChar.name} desde el principio.`
        : `Conversation with ${activeChar.name} has been reset to the beginning.`
    });
  };

  // Live Call & Continuous Speech State
  const [callActive, setCallActive] = useState(false);
  const [callViewMode, setCallViewMode] = useState<"full" | "chat">("chat");
  const [callSeconds, setCallSeconds] = useState(0);
  const [callState, setCallState] = useState<"idle" | "connecting" | "speaking" | "listening" | "thinking">("idle");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [callSpeakerText, setCallSpeakerText] = useState("");
  const [isCallMuted, setIsCallMuted] = useState(false);

  useEffect(() => {
    let interval: any = null;
    if (callActive) {
      setCallSeconds(0);
      interval = setInterval(() => {
        setCallSeconds((s) => s + 1);
      }, 1000);
    } else {
      setCallSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callActive]);

  const formatCallTime = (totalSec: number) => {
    const m = Math.floor(totalSec / 60).toString().padStart(2, "0");
    const s = (totalSec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // Call Audio & Speech Refs
  const callRecorderRef = useRef<WavRecorder | null>(null);
  const callRecognitionRef = useRef<any>(null);
  const callTranscriptRef = useRef<string>("");
  const callTimersRef = useRef<number[]>([]);
  const callSessionRef = useRef<number>(0);
  const callActiveRef = useRef<boolean>(false);
  const callMutedRef = useRef<boolean>(false);

  useEffect(() => {
    callMutedRef.current = isCallMuted;
  }, [isCallMuted]);

  useEffect(() => {
    return () => {
      // Clean up call on unmount
      callActiveRef.current = false;
      callSessionRef.current += 1;
      callTimersRef.current.forEach((id) => {
        window.clearInterval(id);
        window.clearTimeout(id);
      });
      callTimersRef.current = [];
      if (callRecorderRef.current) {
        callRecorderRef.current.cancel();
        callRecorderRef.current = null;
      }
      try {
        callRecognitionRef.current?.abort();
      } catch {}
      callRecognitionRef.current = null;
    };
  }, []);

  // Audio speech stream ref
  const speechStreamRef = useRef<SpeechStream | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Handle URL param changes
  useEffect(() => {
    if (characterId) {
      setSelectedCharacterId(characterId);
      setViewMode("room");
      if (!openConversations.includes(characterId)) {
        setOpenConversations((prev) => [characterId, ...prev]);
      }
    } else {
      setViewMode("explore");
    }
  }, [characterId]);

  // Active character
  const activeChar = useMemo<CharacterItem>(() => {
    const foundChar = characterList.find((c) => c.id === selectedCharacterId);
    if (foundChar) return foundChar;
    return characterList[0] || TALKIEMATE_CHARACTERS[0];
  }, [characterList, selectedCharacterId]);

  // Active character full media (video or photo)
  const activeMediaUrl = activeChar.gallery[activePhotoIdx] || activeChar.avatar;
  const isVideoMedia = isMediaVideo(activeMediaUrl);

  // Messages for active character: Only clean starter message if no conversation yet
  const currentMessages = useMemo(() => {
    const history = chatHistory[activeChar.id];
    const greeting = isEs
      ? (activeChar.starterMessageEs || activeChar.starterMessage)
      : (activeChar.starterMessageEn || activeChar.starterMessage);

    if (!history || history.length === 0) {
      return [
        {
          id: `starter-${activeChar.id}`,
          role: "assistant" as const,
          content: greeting,
          timestamp: isEs ? "Ahora" : "Just now"
        }
      ];
    }

    // Si el primer mensaje fue el saludo inicial, garantizar que siempre refleje el starterMessage configurado
    if (history.length > 0 && history[0].role === "assistant" && history[0].content !== greeting) {
      return [
        {
          ...history[0],
          content: greeting
        },
        ...history.slice(1)
      ];
    }

    return history;
  }, [chatHistory, activeChar, isEs]);

  // Sincronizar automáticamente chatHistory en localStorage cuando el starterMessage del personaje cambie
  useEffect(() => {
    if (!activeChar) return;
    const greeting = isEs
      ? (activeChar.starterMessageEs || activeChar.starterMessage)
      : (activeChar.starterMessageEn || activeChar.starterMessage);
    if (!greeting) return;

    setChatHistory((prev) => {
      const history = prev[activeChar.id];
      if (!history || history.length === 0) return prev;

      if (history[0].role === "assistant" && history[0].content !== greeting) {
        const next = {
          ...prev,
          [activeChar.id]: [{ ...history[0], content: greeting }, ...history.slice(1)]
        };
        try {
          localStorage.setItem("insomnia_user_chat_history_v1", JSON.stringify(next));
        } catch {}
        return next;
      }

      return prev;
    });
  }, [activeChar?.id, activeChar?.starterMessage, activeChar?.starterMessageEs, isEs]);

  // Scroll to bottom
  useEffect(() => {
    if (viewMode === "room") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [currentMessages, isTyping, viewMode]);

  // Open Chat Room for a specific Character
  const handleOpenChat = (id: string) => {
    setSelectedCharacterId(id);
    if (!openConversations.includes(id)) {
      setOpenConversations((prev) => [id, ...prev]);
    }
    setViewMode("room");
    navigate(`/chat/${id}`, { replace: true });
    setActivePhotoIdx(0);
  };

  // Close a conversation from left sidebar
  const handleCloseConversation = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = openConversations.filter((c) => c !== id);
    setOpenConversations(updated);
    if (selectedCharacterId === id && updated.length > 0) {
      setSelectedCharacterId(updated[0]);
      navigate(`/chat/${updated[0]}`, { replace: true });
    } else if (updated.length === 0) {
      setViewMode("explore");
      navigate("/chat", { replace: true });
    }
  };

  // Send message in chat room
  const handleSendMessage = async () => {
    const text = inputText.trim();
    if (!text || isTyping) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    const initialStarter: ChatMessage = {
      id: `starter-${activeChar.id}`,
      role: "assistant",
      content: isEs
        ? (activeChar.starterMessageEs || activeChar.starterMessage)
        : (activeChar.starterMessageEn || activeChar.starterMessage),
      timestamp: isEs ? "Inicio" : "Start"
    };

    const currentHistory = chatHistory[activeChar.id] || [initialStarter];
    const updatedHistory = [...currentHistory, userMsg];

    setChatHistory((prev) => ({
      ...prev,
      [activeChar.id]: updatedHistory
    }));
    setInputText("");
    setIsTyping(true);

    if (typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis.paused) {
      try { window.speechSynthesis.resume(); } catch {}
    }

    try {
      const existingHistory = updatedHistory;
      const mother = getMotherCardConfig();
      const rawAiSettings = getStoryAiSettings(activeChar.id);
      const isCharNsfw = Boolean(activeChar.isNsfw || rawAiSettings.adultMode || adultEnabled);
      const selectedModelId = isCharNsfw ? "magnum-v4-local" : (rawAiSettings.modelId || activeChar.modelId || mother.aiSettings.modelId || "insomnia-flash");
      const charAiSettings = {
        ...mother.aiSettings,
        ...rawAiSettings,
        modelId: selectedModelId,
        adultMode: isCharNsfw,
        dialogueRatio: mother.dialogueRatio || 0.80,
        narrationRatio: mother.narrationRatio || 0.20,
        customDirective: rawAiSettings.customDirective || mother.masterDirective,
        messageLength: Math.max(300, Number(rawAiSettings.messageLength || mother.targetTokens)),
      };

      // Memory depth matching story cards (up to 260 turns for 32k, 140 for 16k)
      const maxTurns = charAiSettings.memoryTier === "32k" ? 260 : charAiSettings.memoryTier === "16k" ? 140 : charAiSettings.memoryTier === "4k" ? 60 : 30;
      const historyPayload = currentHistory.slice(-maxTurns).map((m) => ({
        role: m.role,
        content: m.content
      }));

      const { playerRoleName, resolvedCharRole, isSobrina, charBio } = resolveChatKinship(activeChar, existingHistory, isEs);
      
      // Full unified persistent chronicle and memory recall
      const chroniclePayload = buildPersistentChronicle(historyPayload, activeChar.name, playerRoleName);
      const memoryPayload = selectStoryMemory(
        historyPayload,
        text,
        charAiSettings.memoryTier === "32k" ? 60 : charAiSettings.memoryTier === "16k" ? 40 : 20
      );
      const charRegion = spokenRegion(getStoryRegion(activeChar.id), getStoryAccent(activeChar.id)) || (isEs ? "co" : "us");

      const roleRelationSentence = isSobrina
        ? `Parentesco inmutable: el usuario es su ${playerRoleName} y ella es su ${resolvedCharRole}.`
        : `Relación: el usuario es su ${playerRoleName} masculino (NO son familiares, estrictamente prohibido inventar que es su tío o pariente).`;

      const { data, error } = await invokeFunctionWithRetry<{ content?: string }>("story-chat", {
        story: {
          id: activeChar.id,
          title: activeChar.name,
          description: charBio,
          story_context: `${resolvedCharRole}. Personalidad: ${charBio}. ${roleRelationSentence}`,
          character_role: resolvedCharRole,
          player_role: playerRoleName,
          story_type: "chat_page"
        },
        chatSource: "chat_page",
        isLiveCall: false,
        language,
        history: historyPayload,
        memory: memoryPayload,
        chronicle: chroniclePayload,
        userMessage: text,
        adultMode: Boolean(adultEnabled || isCharNsfw),
        isNsfw: isCharNsfw,
        region: charRegion,
        settings: charAiSettings
      });

      let reply = "";
      if (!error && data?.content) {
        reply = data.content;
      } else {
        // Reintento limpio inmediato si hubo un error transitorio
        const retryResult = await invokeFunctionWithRetry<{ content?: string }>("story-chat", {
          story: {
            id: activeChar.id,
            title: activeChar.name,
            description: charBio,
            story_context: `${resolvedCharRole}. Personalidad: ${charBio}. ${roleRelationSentence}`,
            character_role: resolvedCharRole,
            player_role: playerRoleName,
            story_type: "chat_page"
          },
          chatSource: "chat_page",
          isLiveCall: false,
          language,
          history: historyPayload,
          userMessage: text,
          adultMode: Boolean(adultEnabled || isCharNsfw),
          isNsfw: isCharNsfw,
          region: charRegion,
          settings: charAiSettings
        });

        if (retryResult?.data?.content) {
          reply = retryResult.data.content;
        } else {
          setIsTyping(false);
          toast({
            title: isEs ? "Error de conexión temporal" : "Temporary connection error",
            description: isEs
              ? "No se pudo recibir la respuesta del personaje. Por favor pulsa enviar nuevamente."
              : "Could not receive character reply. Please try resending your message.",
            variant: "destructive"
          });
          return;
        }
      }

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      };

      setChatHistory((prev) => ({
        ...prev,
        [activeChar.id]: [...(prev[activeChar.id] || []), assistantMsg]
      }));

      // AUTO-VOICE: If corneta is active (!isChatMuted), automatically speak incoming message aloud!
      if (!isChatMuted) {
        void handlePlayAudio(assistantMsg.id, reply);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsTyping(false);
    }
  };

  // Stop any active speech stream or audio
  const stopAudio = () => {
    if (speechStreamRef.current) {
      speechStreamRef.current.stop();
      speechStreamRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      (window as any).__insomnia_active_utterance = null;
    }
    setPlayingAudioId(null);
  };

  // Play audio with Insomnia's native expressive speech engine
  // Play audio with Insomnia's native expressive speech engine
  const handlePlayAudio = async (messageId: string, text: string) => {
    if (playingAudioId === messageId) {
      stopAudio();
      return;
    }

    stopAudio();
    setPlayingAudioId(messageId);

    // Activar foley acústico cinematográfico (puertas, pasos, sábanas, roces, etc.)
    playSceneFoley(text);

    // Voz neural con acento regional auténtico asignado al personaje
    const voiceToUse = activeChar.voiceName || "Aoede";
    const charRegion = spokenRegion(getStoryRegion(activeChar.id), getStoryAccent(activeChar.id)) || (language === "es" ? "co" : "us");

    try {
      const stream = streamSpeech(text, voiceToUse, language, true, charRegion);
      speechStreamRef.current = stream;
      await stream.done;
      if (speechStreamRef.current === stream) {
        speechStreamRef.current = null;
        setPlayingAudioId(null);
      }
    } catch (err) {
      console.warn("streamSpeech audio playback error or aborted:", err);
      speechStreamRef.current = null;
      setPlayingAudioId(null);
    }
  };

  const clearCallTimers = () => {
    callTimersRef.current.forEach((id) => {
      window.clearInterval(id);
      window.clearTimeout(id);
    });
    callTimersRef.current = [];
  };

  // Hang up and end the call
  const handleEndCall = () => {
    callActiveRef.current = false;
    callSessionRef.current += 1;
    clearCallTimers();
    stopAudio();
    if (callRecorderRef.current) {
      callRecorderRef.current.cancel();
      callRecorderRef.current = null;
    }
    try {
      callRecognitionRef.current?.abort();
    } catch {}
    callRecognitionRef.current = null;
    callTranscriptRef.current = "";
    setLiveTranscript("");
    setCallSpeakerText("");
    setCallState("idle");
    setCallActive(false);
    setCallViewMode("chat");
  };

  // Speak character voice during call
  // Speak character voice during call
  const callSpeak = async (text: string): Promise<boolean> => {
    if (!callActiveRef.current) return false;
    setCallState("speaking");
    setCallSpeakerText(text);
    const spoken = text.trim();
    const voiceToUse = activeChar.voiceName || "Aoede";
    const charRegion = spokenRegion(getStoryRegion(activeChar.id), getStoryAccent(activeChar.id)) || (isEs ? "co" : "us");

    try {
      const stream = streamSpeech(spoken, voiceToUse, language, true, charRegion);
      speechStreamRef.current = stream;
      await stream.done;
      if (speechStreamRef.current === stream) {
        speechStreamRef.current = null;
      }
      return callActiveRef.current;
    } catch (err) {
      console.warn("callSpeak speech stream error:", err);
      return callActiveRef.current;
    }
  };

  const callListen = async () => {
    if (!callActiveRef.current) return;
    if (callMutedRef.current) {
      setCallState("listening");
      setLiveTranscript(isEs ? "(Micrófono silenciado)" : "(Microphone muted)");
      return;
    }

    stopAudio();
    clearCallTimers();
    callTranscriptRef.current = "";
    setLiveTranscript("");
    setCallState("listening");

    try {
      const recorder = await startWavRecording();
      if (!callActiveRef.current) {
        recorder.cancel();
        return;
      }
      callRecorderRef.current = recorder;

      let silentFor = 0;
      let heardVoice = false;
      let peakLevel = 0;
      let lastSpeechChangeAt = Date.now();
      let hasFinalResult = false;

      // Browser SpeechRecognition for instant real-time live feedback
      const browser = window as Window & {
        SpeechRecognition?: any;
        webkitSpeechRecognition?: any;
      };
      const Recognition = browser.SpeechRecognition || browser.webkitSpeechRecognition;
      const hasRecognition = Boolean(Recognition);

      if (Recognition) {
        try {
          const recognition = new Recognition();
          recognition.lang = browserSpeechLocale(language, "mx");
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.onresult = (event: any) => {
            const resultsArr = Array.from(event.results as ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>);
            const text = resultsArr
              .map((res) => res[0]?.transcript || "")
              .join(" ")
              .trim();
            if (text) {
              if (text !== callTranscriptRef.current) {
                lastSpeechChangeAt = Date.now();
              }
              callTranscriptRef.current = text;
              setLiveTranscript(text);
              heardVoice = true;
              silentFor = 0;
              const lastResult = resultsArr[resultsArr.length - 1];
              hasFinalResult = Boolean(lastResult?.isFinal);
            }
          };
          recognition.onerror = () => {
            if (callRecognitionRef.current === recognition) callRecognitionRef.current = null;
          };
          recognition.onend = () => {
            if (callActiveRef.current && callRecognitionRef.current === recognition && callRecorderRef.current) {
              try { recognition.start(); } catch { callRecognitionRef.current = null; }
            }
          };
          recognition.start();
          callRecognitionRef.current = recognition;
        } catch {
          callRecognitionRef.current = null;
        }
      }

      const MAX_TURN_MS = 25000;

      // Sensitive VAD loop: checks every 100ms
      const meter = window.setInterval(() => {
        if (!callActiveRef.current) return;
        const level = recorder.getLevel();
        if (level > peakLevel) peakLevel = level;
        // Optimized mic sensitivity: captures quiet/trailing speech without false cutoffs
        const activeThreshold = Math.max(0.007, Math.min(0.02, peakLevel * 0.20));

        if (level > activeThreshold) {
          heardVoice = true;
          silentFor = 0;
        } else {
          silentFor += 100;
        }

        const hasTranscript = callTranscriptRef.current.trim().length > 0;
        const msSinceTranscriptChange = Date.now() - lastSpeechChangeAt;

        // Detect when user finished speaking:
        // 1. Web Speech caught words and user paused naturally (>= 1.1s quiet)
        const transcriptDone = hasTranscript && (
          (silentFor >= 900 && ((hasFinalResult && msSinceTranscriptChange >= 1100) || msSinceTranscriptChange >= 1400)) ||
          (silentFor >= 600 && msSinceTranscriptChange >= 1700) ||
          (silentFor >= 1350)
        );

        // 2. Microphone audio detected user vocalizing and user paused for >= 1350ms
        const voiceDone = (heardVoice || hasTranscript) && silentFor >= 1350;

        if (transcriptDone || voiceDone) {
          window.clearInterval(meter);
          void finishCallTurn();
        }
      }, 100);
      callTimersRef.current.push(meter);

      const maxTimer = window.setTimeout(() => {
        window.clearInterval(meter);
        void finishCallTurn();
      }, MAX_TURN_MS);
      callTimersRef.current.push(maxTimer);
    } catch (err) {
      console.warn("Microphone access error:", err);
      toast({
        title: isEs ? "Micrófono requerido" : "Microphone required",
        description: isEs
          ? "Por favor permite el acceso al micrófono en tu navegador para hablar durante la llamada."
          : "Please allow microphone access in your browser to talk during the call.",
        variant: "destructive"
      });
      setCallState("speaking");
    }
  };

  // Finish user speech turn and generate character response
  const finishCallTurn = async () => {
    const recorder = callRecorderRef.current;
    callRecorderRef.current = null;
    clearCallTimers();
    if (!recorder || !callActiveRef.current) return;

    const activeRecognition = callRecognitionRef.current;
    callRecognitionRef.current = null;
    try { activeRecognition?.stop(); } catch {}

    const spoke = recorder.heardSpeech();
    const blob = await recorder.stop();
    if (!callActiveRef.current) return;

    // Grace period for browser recognition to deliver final words
    if (!callTranscriptRef.current.trim() && activeRecognition) {
      await new Promise((r) => window.setTimeout(r, 180));
    }

    let userText = callTranscriptRef.current.trim();
    callTranscriptRef.current = "";
    setLiveTranscript("");

    const currentCallSession = callSessionRef.current;

    const browser = window as Window & {
      SpeechRecognition?: any;
      webkitSpeechRecognition?: any;
    };
    const hasRecognition = Boolean(browser.SpeechRecognition || browser.webkitSpeechRecognition);

    // If real-time browser recognition didn't yield text, check if the microphone captured speech audio
    if (!userText) {
      if ((spoke || blob.size >= 8000) && blob.size > 2000) {
        setCallState("thinking");
        try {
          const audio = await blobToBase64(blob);
          if (!callActiveRef.current || callSessionRef.current !== currentCallSession) return;

          const { data, error } = await invokeFunctionWithRetry<{ text?: string }>("speech-to-text", {
            audio,
            mimeType: "audio/wav",
            language: isEs ? "es" : "en",
            region: "mx"
          });

          if (!error && data?.text) {
            userText = data.text.trim();
          }
        } catch (e) {
          console.warn("Speech to text fallback error:", e);
        }
      }
    }

    if (!userText) {
      if (callActiveRef.current && callSessionRef.current === currentCallSession) {
        void callListen();
      }
      return;
    }

    // Set UI to thinking now that we have real user words
    setCallState("thinking");

    // 1. Prior history BEFORE userText to avoid prompt duplication
    const priorHistory = (chatHistory[activeChar.id] || []).slice(-10).map((m) => ({
      role: m.role,
      content: m.content
    }));

    // 2. Save user speech directly to chat history in real time
    const userMsg: ChatMessage = {
      id: `u-call-${Date.now()}`,
      role: "user",
      content: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    setChatHistory((prev) => {
      const existing = prev[activeChar.id] || [];
      return {
        ...prev,
        [activeChar.id]: [...existing, userMsg]
      };
    });

    // 3. Request AI reply continuing the unbroken conversation
    try {
      const { playerRoleName, resolvedCharRole, isSobrina, charBio } = resolveChatKinship(activeChar, chatHistory[activeChar.id] || [], isEs);
      const mother = getMotherCardConfig();
      const rawAiSettings = getStoryAiSettings(activeChar.id);
      const isCharNsfw = Boolean(activeChar.isNsfw || rawAiSettings.adultMode || rawAiSettings.modelId === "magnum-v4-local");
      const charAiSettings = {
        ...mother.aiSettings,
        ...rawAiSettings,
      };

      // Fast call settings: 45 tokens max for instant snappy phone response (<0.5s)
      const fastCallSettings = {
        ...charAiSettings,
        modelId: isCharNsfw ? "magnum-v4-local" : "insomnia-flash",
        adultMode: Boolean(adultEnabled || isCharNsfw),
        messageLength: 45
      };
      const charRegion = spokenRegion(getStoryRegion(activeChar.id), getStoryAccent(activeChar.id)) || (isEs ? "co" : "us");

      const { data, error } = await invokeFunctionWithRetry<{ content?: string }>("story-chat", {
        story: {
          id: activeChar.id,
          title: activeChar.name,
          description: charBio,
          story_context: `${resolvedCharRole}. Bio: ${charBio}. Parentesco inmutable: el usuario es su ${playerRoleName} y ella es su ${resolvedCharRole}`,
          character_role: resolvedCharRole,
          player_role: playerRoleName,
          story_type: "live_call"
        },
        chatSource: "chat_page",
        isLiveCall: true,
        language,
        history: priorHistory,
        memory: selectStoryMemory(priorHistory, userText),
        userMessage: userText,
        adultMode: Boolean(adultEnabled || isCharNsfw),
        isNsfw: isCharNsfw,
        region: charRegion,
        settings: fastCallSettings
      });

      let reply = "";
      if (!error && data?.content) {
        const clean = normalizeAssistantReply(data.content) || data.content;
        reply = clean.trim();
      } else {
        reply = isSobrina
          ? (isEs ? `*suspira suavemente* Te escucho tío... Dime más.` : `*sighs softly* I'm listening uncle... Tell me more.`)
          : (isEs ? `*sonríe* Te escucho perfectamente... Cuéntame más.` : `*smiles* I hear you loud and clear... Tell me more.`);
      }

      if (!callActiveRef.current || callSessionRef.current !== currentCallSession) return;

      // 4. Add character reply directly to chat history!
      const assistantMsg: ChatMessage = {
        id: `a-call-${Date.now()}`,
        role: "assistant",
        content: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      };

      setChatHistory((prev) => ({
        ...prev,
        [activeChar.id]: [...(prev[activeChar.id] || []), assistantMsg]
      }));

      // 5. Speak reply out loud
      const stillActive = await callSpeak(reply);
      if (stillActive && callSessionRef.current === currentCallSession) {
        void callListen();
      }
    } catch (e) {
      console.error("Call reply generation failed:", e);
      if (callActiveRef.current && callSessionRef.current === currentCallSession) {
        void callListen();
      }
    }
  };

  // Voice Call Entrypoint
  const handleStartCall = async () => {
    stopAudio();
    setCallActive(true);
    setCallViewMode("full");
    setCallState("connecting");
    setLiveTranscript("");
    setCallSpeakerText("");
    callActiveRef.current = true;
    callSessionRef.current += 1;
    const currentSession = callSessionRef.current;

    // Check existing chat history for context continuity & kinship role
    const existingHistory = chatHistory[activeChar.id] || [];
    const hasUserChatted = existingHistory.some((m) => m.role === "user");
    const { playerRoleName, resolvedCharRole, isSobrina, charBio } = resolveChatKinship(activeChar, existingHistory, isEs);

    let greetingText = "";

    const lastUser = [...existingHistory].reverse().find((m) => m.role === "user");
    const lastTopic = lastUser ? lastUser.content.slice(0, 120) : "";

    const promptContext = hasUserChatted
      ? (isEs
          ? `(Te acabo de llamar por teléfono para continuar nuestra conversación. Contesta la llamada en tu personaje de ${resolvedCharRole}, dirigiéndote a mí como tu ${playerRoleName}, y continúa de forma directa lo último que estábamos hablando sobre: "${lastTopic}". Habla en 1 sola oración breve, viva y natural de voz hablada, puedes incluir una reacción vocal acústica como (*se ríe*, *suspira* o *sonríe*) para transmitir emoción).`
          : `(I just called you to continue our chat. Pick up in character as ${resolvedCharRole}, addressing me as your ${playerRoleName}, and continue directly what we were talking about: "${lastTopic}". Speak in 1 brief natural spoken sentence with vocal expression).`)
      : (isEs
          ? `(Te acabo de llamar por teléfono. Atiende la llamada en tu personaje de ${resolvedCharRole}, saludando a tu ${playerRoleName} con familiaridad y respeto a tu parentesco, diciendo algo como: "¡Hola ${playerRoleName}! ¿Cómo estás? Me alegra mucho que me llames...". Habla en 1 sola oración breve de voz hablada real, puedes incluir una reacción vocal acústica como (*se ríe* o *sonríe*)).`
          : `(I just called you. Pick up in character as ${resolvedCharRole}, addressing me as your ${playerRoleName}. Speak in 1 brief natural spoken sentence with vocal expression).`);

    try {
      const historyPayload = existingHistory.slice(-8).map((m) => ({
        role: m.role,
        content: m.content
      }));
      const mother = getMotherCardConfig();
      const rawAiSettings = getStoryAiSettings(activeChar.id);
      const isCharNsfw = Boolean(activeChar.isNsfw || rawAiSettings.adultMode || rawAiSettings.modelId === "magnum-v4-local");
      const charAiSettings = {
        ...mother.aiSettings,
        ...rawAiSettings,
      };
      const charRegion = spokenRegion(getStoryRegion(activeChar.id), getStoryAccent(activeChar.id)) || (isEs ? "co" : "us");

      const { data, error } = await invokeFunctionWithRetry<{ content?: string }>("story-chat", {
        story: {
          id: activeChar.id,
          title: activeChar.name,
          description: charBio,
          story_context: `${resolvedCharRole}. Bio: ${charBio}. Parentesco inmutable: el usuario es su ${playerRoleName} y ella es su ${resolvedCharRole}`,
          character_role: resolvedCharRole,
          player_role: playerRoleName,
          story_type: "live_call"
        },
        chatSource: "chat_page",
        isLiveCall: true,
        language,
        history: historyPayload,
        memory: selectStoryMemory(historyPayload, promptContext),
        userMessage: promptContext,
        adultMode: Boolean(adultEnabled || isCharNsfw),
        isNsfw: isCharNsfw,
        region: charRegion,
        settings: { ...charAiSettings, modelId: isCharNsfw ? "magnum-v4-local" : "insomnia-flash", messageLength: 45 }
      });

      if (!error && data?.content) {
        const clean = normalizeAssistantReply(data.content) || data.content;
        greetingText = clean.trim();
      }
    } catch (e) {
      console.warn("Failed to generate dynamic call intro:", e);
    }

    if (!greetingText) {
      if (isSobrina) {
        greetingText = hasUserChatted
          ? (isEs ? `*sonríe* ¡Hola tío! Sí, te escucho perfectamente... Dime, ¿en qué nos quedamos de lo que me decías?` : `*smiles* Hey uncle! Yes, I hear you loud and clear... Tell me, where were we on what you were saying?`)
          : (isEs ? `*se ríe contenta* ¡Hola tío! Qué alegría que me llames... ¿Cómo estás? Me alegra mucho escucharte.` : `*laughs softly* Hey uncle! What a nice surprise you called... How are you doing?`);
      } else {
        greetingText = hasUserChatted
          ? (isEs ? `*sonríe* ¡Hola! Sí, te escucho perfectamente... Dime, ¿en qué nos quedamos de lo que me decías?` : `*smiles* Hey! Yes, I hear you loud and clear... Tell me, where were we on what you were saying?`)
          : (isEs ? `*sonríe* ¡Hola! Qué gusto que me llames... ¿Cómo estás? Dime, ¿en qué andas?` : `*smiles* Hey! So nice you called... How are you doing?`);
      }
    }

    if (!callActiveRef.current || callSessionRef.current !== currentSession) return;

    // Add greeting to chat history so it is logged in the written chat!
    const introMsg: ChatMessage = {
      id: `call-intro-${Date.now()}`,
      role: "assistant",
      content: greetingText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    setChatHistory((prev) => ({
      ...prev,
      [activeChar.id]: [...(prev[activeChar.id] || []), introMsg]
    }));

    // Speak greeting
    const stillActive = await callSpeak(greetingText);
    if (stillActive && callSessionRef.current === currentSession) {
      void callListen();
    }
  };

  const toggleCallMute = () => {
    const next = !isCallMuted;
    setIsCallMuted(next);
    callMutedRef.current = next;
    if (next) {
      if (callRecorderRef.current) {
        callRecorderRef.current.cancel();
        callRecorderRef.current = null;
      }
      try { callRecognitionRef.current?.abort(); } catch {}
      clearCallTimers();
      setLiveTranscript(isEs ? "(Micrófono silenciado)" : "(Microphone muted)");
    } else {
      if (callState === "listening" || callState === "idle") {
        void callListen();
      }
    }
  };

  // Filtered Characters for Explore Hub
  const filteredExploreChars = useMemo(() => {
    return characterList.filter((c) => {
      const matchGender = activeGender === "all" || c.gender === activeGender;
      const matchStyle = activeStyle === "all" || c.style === activeStyle;
      return matchGender && matchStyle;
    });
  }, [characterList, activeGender, activeStyle]);

  return (
    <div className="flex flex-col h-[100dvh] w-full max-w-full bg-[#000000] text-zinc-100 font-sans select-none overflow-x-hidden">
      {/* Insomnia Header */}
      <Header />

      {/* =========================================================================
          VIEW 1: TALKIEMATE CHARACTER & STORIES HUB
         ========================================================================= */}
      {viewMode === "explore" && (
        <div className="flex-1 overflow-y-auto max-w-[1440px] w-full mx-auto px-3 sm:px-6 md:px-8 py-4 sm:py-6 space-y-6 sm:space-y-8 overflow-x-hidden">
          {/* Top Banner */}
          <div className="relative w-full rounded-2xl overflow-hidden bg-gradient-to-r from-[#180a04] via-[#240e02] to-[#120502] border border-[#ff8c00]/30 shadow-2xl p-6 md:p-8 flex items-center justify-between">
            <div className="space-y-2 z-10">
              <span className="text-xs uppercase tracking-widest text-[#ff8c00] font-bold">
                {isEs ? "Evento Especial TalkieMate" : "TalkieMate Special Event"}
              </span>
              <h2 className="text-2xl md:text-4xl font-extrabold text-white tracking-wide drop-shadow-md">
                {isEs ? "ESPECIAL DE HALLOWEEN" : "HALLOWEEN SPECIAL"}
              </h2>
              <p className="text-sm md:text-base text-zinc-300 font-medium">
                {isEs
                  ? "70% DE DESCUENTO · ROLEPLAY INMERSIVO E HISTORIAS ILIMITADAS"
                  : "SALE 70% OFF · UNLIMITED IMMERSIVE ROLEPLAY & STORIES"}
              </p>
              <button
                onClick={() => handleOpenChat("olivia-adams")}
                className="mt-3 px-6 py-2.5 rounded-full bg-gradient-to-r from-[#ff8c00] to-amber-500 hover:from-amber-500 hover:to-[#ff8c00] text-black font-extrabold text-sm shadow-lg shadow-[#ff8c00]/30 transition-all hover:scale-105 active:scale-95"
              >
                {isEs ? "UNIRSE AHORA" : "JOIN NOW"}
              </button>
            </div>

            <div className="hidden lg:flex items-center gap-3 pr-4">
              <img
                src="https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/6e8f818f9b187d2ebdf4e1d77521e051/3545853885239688145_69992903230.jpg"
                alt="Banner model"
                className="w-24 h-32 rounded-xl object-cover ring-2 ring-[#ff8c00]/40 shadow-lg"
              />
              <img
                src="https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/6e8f818f9b187d2ebdf4e1d77521e051/3525076877293647223_69992903230.jpg"
                alt="Banner model"
                className="w-28 h-36 rounded-xl object-cover ring-2 ring-[#ff8c00] shadow-xl scale-105"
              />
            </div>
          </div>

          {/* Circular Stories Avatar Row */}
          <div className="flex items-center gap-4 md:gap-6 overflow-x-auto pb-2 scrollbar-none">
            {/* Create New Character Story Circle */}
            <div
              onClick={handleOpenCreateConfig}
              className="flex flex-col items-center gap-2 cursor-pointer group flex-shrink-0"
              title={isEs ? "Crear nuevo personaje" : "Create new character"}
            >
              <div className="relative w-18 h-18 md:w-20 md:h-20 rounded-full p-[2px] bg-gradient-to-tr from-zinc-700 to-zinc-800 hover:from-[#ff8c00] hover:to-amber-500 transition-all shadow-lg flex items-center justify-center border-2 border-dashed border-[#ff8c00]/50">
                <div className="w-full h-full rounded-full bg-[#121212] flex items-center justify-center text-[#ff8c00]">
                  <Plus className="w-6 h-6 stroke-[3]" />
                </div>
              </div>
              <span className="text-xs text-zinc-300 font-semibold group-hover:text-[#ff8c00] transition-colors truncate max-w-[72px] text-center">
                {isEs ? "+ Crear" : "+ Create"}
              </span>
            </div>

            {characterList.map((char) => (
              <div
                key={`story-circle-${char.id}`}
                onClick={() => handleOpenChat(char.id)}
                className="flex flex-col items-center gap-2 cursor-pointer group flex-shrink-0"
              >
                <div className="relative w-18 h-18 md:w-20 md:h-20 rounded-full p-[2px] bg-gradient-to-tr from-[#ff8c00] via-amber-400 to-[#e67e00] group-hover:scale-105 transition-transform shadow-lg shadow-[#ff8c00]/20">
                  <div className="w-full h-full rounded-full overflow-hidden border-2 border-black bg-black">
                    {isMediaVideo(char.avatar) ? (
                      <video
                        src={char.avatar}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                      />
                    ) : (
                      <img
                        src={char.avatar}
                        alt={char.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                      />
                    )}
                  </div>
                  <span className="absolute bottom-0 right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-black" />
                </div>
                <span className="text-xs text-zinc-300 font-medium group-hover:text-[#ff8c00] transition-colors truncate max-w-[72px] text-center">
                  {char.name.split(" ")[0]}
                </span>
              </div>
            ))}
          </div>

          {/* Section: Explore Featured Experiences */}
          <div className="space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center justify-between sm:justify-start gap-3 w-full lg:w-auto">
                <h3 className="text-xl md:text-2xl font-bold text-white tracking-wide flex items-center gap-2">
                  {isEs ? "Explorar" : "Explore"} <span className="text-[#ff8c00]">{isEs ? "Experiencias Destacadas" : "Featured Experiences"}</span>
                </h3>

                {/* Prominent Create Character Button in Lobby Header */}
                <button
                  onClick={handleOpenCreateConfig}
                  className="px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl border border-[#ff8c00] bg-black text-[#ff8c00] hover:bg-[#ff8c00]/15 font-bold text-xs sm:text-sm tracking-wide transition-all shadow-md shadow-[#ff8c00]/10 flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
                  title={isEs ? "Crear un nuevo personaje" : "Create new character"}
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>{isEs ? "Crear Personaje / Chat" : "Create Character / Chat"}</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                {/* Gender filters */}
                <div className="flex items-center bg-[#141414] border border-[#2a2a2a] rounded-full p-1">
                  {(["all", "female", "male", "non-binary"] as const).map((g) => {
                    const label = isEs
                      ? g === "all" ? "Todos" : g === "female" ? "Mujer" : g === "male" ? "Hombre" : "No binario"
                      : g === "all" ? "All" : g === "female" ? "Female" : g === "male" ? "Male" : "Non-binary";
                    return (
                      <button
                        key={g}
                        onClick={() => setActiveGender(g)}
                        className={`px-3 py-1 rounded-full font-semibold transition-all ${
                          activeGender === g
                            ? "bg-[#ff8c00] text-black shadow-sm"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* Style filters */}
                <div className="flex items-center bg-[#141414] border border-[#2a2a2a] rounded-full p-1">
                  {(["all", "realistic", "anime"] as const).map((s) => {
                    const label = isEs
                      ? s === "all" ? "Todos" : s === "anime" ? "Anime y Manga" : "Realista"
                      : s === "all" ? "All" : s === "anime" ? "Anime & Manga" : "Realistic";
                    return (
                      <button
                        key={s}
                        onClick={() => setActiveStyle(s)}
                        className={`px-3 py-1 rounded-full font-semibold transition-all ${
                          activeStyle === s
                            ? "bg-[#ff8c00] text-black shadow-sm"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* Random button */}
                <button
                  onClick={() => {
                    const rnd = characterList[Math.floor(Math.random() * characterList.length)];
                    handleOpenChat(rnd.id);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#181818] border border-[#2c2c2c] text-zinc-300 hover:text-[#ff8c00] hover:border-[#ff8c00]/50 transition-colors"
                >
                  <Shuffle className="w-3.5 h-3.5 text-[#ff8c00]" />
                  <span>{isEs ? "Aleatorio" : "Random"}</span>
                </button>
              </div>
            </div>

            {/* Grid of Character Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-4 w-full">
              {/* Card 1: Interactive 'Create your Character' card in the lobby */}
              <div
                onClick={handleOpenCreateConfig}
                className="group relative rounded-2xl overflow-hidden aspect-[3/4] sm:aspect-[9/15] bg-gradient-to-b from-[#1c1208] via-[#0e0703] to-[#000000] border-2 border-dashed border-[#ff8c00]/70 hover:border-[#ff8c00] cursor-pointer transition-all shadow-lg hover:shadow-2xl hover:shadow-[#ff8c00]/25 flex flex-col items-center justify-between p-3 sm:p-4 text-center w-full max-w-full hover:scale-[1.02] active:scale-[0.98]"
              >
                {/* Ambient glow effect */}
                <div className="absolute inset-0 bg-radial-gradient from-[#ff8c00]/15 via-transparent to-transparent opacity-70 group-hover:opacity-100 transition-opacity pointer-events-none" />

                {/* Top badge & icon */}
                <div className="relative z-10 w-full flex flex-col items-center pt-1 sm:pt-2">
                  <span className="text-[10px] uppercase font-extrabold tracking-widest text-[#ff8c00] bg-[#ff8c00]/15 px-2.5 py-0.5 rounded-full border border-[#ff8c00]/30 mb-2.5 shadow-sm">
                    {isEs ? "Nuevo Personaje" : "New Character"}
                  </span>

                  <div className="w-13 h-13 sm:w-16 sm:h-16 rounded-full bg-gradient-to-tr from-[#ff8c00]/20 to-[#ff8c00]/40 border-2 border-[#ff8c00] flex items-center justify-center text-[#ff8c00] shadow-lg shadow-[#ff8c00]/30 group-hover:scale-110 transition-transform mb-2 sm:mb-3">
                    <Plus className="w-6 h-6 sm:w-8 sm:h-8 stroke-[3]" />
                  </div>

                  <h4 className="text-sm sm:text-base font-extrabold text-white leading-tight drop-shadow">
                    {isEs ? "¿Quieres crear tu personaje?" : "Create your character?"}
                  </h4>
                  <p className="text-[11px] sm:text-xs text-zinc-300 mt-1 leading-snug line-clamp-3">
                    {isEs
                      ? "Crea su personalidad, voz, avatar e historia a tu medida."
                      : "Create personality, voice, avatar, and custom story suited to you."}
                  </p>
                </div>

                {/* Bottom button inside the card */}
                <div className="relative z-10 w-full pb-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenCreateConfig();
                    }}
                    className="w-full py-2 sm:py-2.5 px-2 rounded-xl border border-[#ff8c00] bg-black text-[#ff8c00] group-hover:bg-[#ff8c00] group-hover:text-black font-extrabold text-xs tracking-wide transition-all flex items-center justify-center gap-1.5 shadow-md shadow-[#ff8c00]/20"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    <span className="truncate">{isEs ? "Crear Personaje / Chat" : "Create Character / Chat"}</span>
                  </button>
                </div>
              </div>

              {filteredExploreChars.map((char) => {
                const shortBioText = isEs
                  ? (char.shortBioEs || char.shortBio)
                  : (char.shortBioEn || char.shortBio);

                return (
                  <div
                    key={char.id}
                    onClick={() => handleOpenChat(char.id)}
                    className="group relative rounded-2xl overflow-hidden aspect-[3/4] sm:aspect-[9/15] bg-[#141414] border border-[#242424] hover:border-[#ff8c00] cursor-pointer transition-all shadow-md hover:shadow-xl hover:shadow-[#ff8c00]/10 flex flex-col justify-end w-full max-w-full"
                  >
                    {isMediaVideo(char.avatar) ? (
                      <video
                        src={char.avatar}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <img
                        src={char.avatar}
                        alt={char.name}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

                    {/* +18 NSFW Badge */}
                    {(char.isNsfw || getStoryAiSettings(char.id).adultMode || getStoryAiSettings(char.id).modelId === "magnum-v4-local") && (
                      <div className="absolute top-3 left-3 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-600/90 text-white font-black text-[10px] tracking-wider shadow-md backdrop-blur border border-red-400/50">
                        <Flame className="w-3 h-3 fill-current" />
                        <span>+18</span>
                      </div>
                    )}

                    <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
                      <span className="p-1 rounded-full bg-black/60 backdrop-blur text-zinc-300 hover:text-white">
                        <Info className="w-3.5 h-3.5" />
                      </span>
                      <span className="p-1 rounded-full bg-black/60 backdrop-blur text-zinc-300 hover:text-[#ff8c00]">
                        <Heart className="w-3.5 h-3.5 text-[#ff8c00]" />
                      </span>
                    </div>

                    <div className="relative z-10 p-3 space-y-1">
                      <h4 className="text-sm font-bold text-white truncate drop-shadow">
                        {char.name}, {char.age}
                      </h4>
                      <p className="text-[11px] text-zinc-300 line-clamp-2 leading-tight">
                        {shortBioText}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW 2: TALKIEMATE ORIGINAL CHAT ROOM (3-COLUMN LAYOUT)
         ========================================================================= */}
      {viewMode === "room" && (
        <div className="flex-1 flex justify-center w-full overflow-hidden bg-[#000000]">
          {/* Framed Application Container for perfect proportions on all monitors */}
          <div className="flex w-full max-w-[1560px] h-[calc(100vh-64px)] border-x border-[#1a1a1a] bg-[#000000] overflow-hidden">
            
            {/* ----------------------------------------------------
                LEFT PANEL: "Conversations" (Hidden on mobile inside chat room)
               ---------------------------------------------------- */}
            <aside className="hidden md:flex w-[260px] lg:w-[280px] bg-[#000000] border-r border-[#222222] flex-col flex-shrink-0 z-20">
              {/* Header */}
              <div className="p-4 pb-3 flex items-center justify-between">
                <h3 className="text-lg font-bold text-white tracking-normal">
                  {isEs ? "Conversaciones" : "Conversations"}
                </h3>
                <button
                  onClick={() => {
                    setViewMode("explore");
                    navigate("/chat");
                  }}
                  className="text-xs text-[#ff8c00] hover:underline flex items-center gap-1 font-semibold"
                  title={isEs ? "Volver al catálogo" : "Back to explore"}
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> {isEs ? "Explorar" : "Explore"}
                </button>
              </div>

              {/* Conversation list: Shows only open active chats, clean empty state on fresh start */}
              <div className="flex-1 overflow-y-auto px-2 space-y-2">
                {openConversations.length === 0 ? (
                  <div className="py-12 px-4 text-center text-zinc-500 space-y-3">
                    <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 mx-auto flex items-center justify-center text-zinc-500">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-semibold text-zinc-400">
                      {isEs ? "Sin conversaciones activas" : "No active conversations"}
                    </p>
                    <p className="text-[11px] text-zinc-500 leading-relaxed">
                      {isEs
                        ? "Selecciona un personaje en Explorar para comenzar un nuevo chat."
                        : "Select a character in Explore to start a new chat."}
                    </p>
                  </div>
                ) : (
                  openConversations.map((charId) => {
                    const convChar = characterList.find((c) => c.id === charId);
                    if (!convChar) return null;
                    const isSelected = convChar.id === selectedCharacterId;
                    const history = chatHistory[convChar.id] || [];
                    const lastMsg = history[history.length - 1];
                    const snippet = lastMsg
                      ? lastMsg.content
                      : isEs
                      ? (convChar.starterMessageEs || convChar.starterMessage)
                      : (convChar.starterMessageEn || convChar.starterMessage);

                    return (
                      <div
                        key={`conv-${convChar.id}`}
                        onClick={() => handleOpenChat(convChar.id)}
                        className={`
                          group relative flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-all border
                          ${
                            isSelected
                              ? "bg-[#282828] border-[#383838]"
                              : "bg-[#181818] border-transparent hover:bg-[#202020]"
                          }
                        `}
                      >
                        {/* Fixed 48x48 thumbnail */}
                        <div className="relative w-12 h-12 min-w-[48px] max-w-[48px] h-[48px] rounded-lg overflow-hidden flex-shrink-0 bg-zinc-800">
                          <img
                            src={convChar.avatar}
                            alt={convChar.name}
                            className="w-full h-full object-cover block"
                          />
                        </div>

                        {/* Small orange active dot */}
                        <span className="w-2.5 h-2.5 rounded-full bg-[#ff8c00] flex-shrink-0 shadow-sm shadow-[#ff8c00]" />

                        {/* Text Details */}
                        <div className="flex-1 min-w-0 pr-5">
                          <div className="flex items-center justify-between">
                            <span className="text-[13px] font-bold text-white truncate leading-tight">
                              {convChar.name}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400 truncate mt-0.5 leading-tight">
                            {snippet}
                          </p>
                        </div>

                        {/* Orange circular close button with X */}
                        <button
                          onClick={(e) => handleCloseConversation(e, convChar.id)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#ff8c00] text-black flex items-center justify-center hover:scale-110 transition-transform"
                          title={isEs ? "Cerrar conversación" : "Close conversation"}
                        >
                          <X className="w-2.5 h-2.5 stroke-[3]" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Bottom Button: [ Add conversation / New Character ] */}
              <div className="p-3 border-t border-[#1a1a1a]">
                <button
                  onClick={handleOpenCreateConfig}
                  className="w-full py-2.5 rounded-xl border border-[#ff8c00] bg-black text-[#ff8c00] hover:bg-[#ff8c00]/10 font-bold text-xs tracking-wide transition-colors flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[3]" /> {isEs ? "Crear Personaje / Chat" : "Create Character / Chat"}
                </button>
              </div>
            </aside>

            {/* ----------------------------------------------------
                CENTER PANEL: Chat Feed or Full Live Call Screen
               ---------------------------------------------------- */}
            {callActive && callViewMode === "full" ? (
              <main className="flex-1 flex flex-col justify-between bg-black border-r border-[#222222] relative overflow-hidden select-none">
                {/* Full Character Media in Background (Photo or Video) */}
                <div className="absolute inset-0 z-0">
                  {isVideoMedia ? (
                    <video
                      src={activeMediaUrl}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={activeMediaUrl}
                      alt={activeChar.name}
                      className="w-full h-full object-cover"
                    />
                  )}
                  {/* Subtle cinematic gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/60 pointer-events-none" />
                </div>

                {/* Top Floating Info Bar */}
                <div className="relative z-10 p-5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white text-xs font-semibold shadow-xl">
                    <span className={`w-2.5 h-2.5 rounded-full ${
                      callState === "speaking"
                        ? "bg-emerald-400 animate-pulse"
                        : callState === "listening"
                        ? "bg-cyan-400 animate-ping"
                        : "bg-amber-400 animate-pulse"
                    }`} />
                    <span className="font-bold text-sm tracking-wide">{activeChar.name}</span>
                    <span className="text-zinc-400">·</span>
                    <span className="text-emerald-400 font-mono text-xs font-bold">{formatCallTime(callSeconds)}</span>
                  </div>

                  <button
                    onClick={() => setCallViewMode("chat")}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 hover:border-white/30 text-zinc-200 hover:text-white text-xs font-bold transition-all shadow-xl hover:scale-105 active:scale-95"
                    title={isEs ? "Ver conversación en el chat" : "View chat conversation"}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>{isEs ? "Ver Chat" : "View Chat"}</span>
                  </button>
                </div>

                {/* Bottom Floating Call Controls Dock */}
                <div className="relative z-10 p-6 pb-12 flex flex-col items-center">
                  {/* Clean circular action buttons */}
                  <div className="flex items-center gap-6">
                    {/* Mute Button */}
                    <button
                      onClick={toggleCallMute}
                      className={`w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-md border transition-transform hover:scale-105 active:scale-95 shadow-2xl ${
                        isCallMuted
                          ? "bg-red-500/80 border-red-400 text-white shadow-red-500/30"
                          : "bg-black/60 border-white/20 text-white hover:bg-black/80"
                      }`}
                      title={isCallMuted ? (isEs ? "Activar micrófono" : "Unmute mic") : (isEs ? "Silenciar micrófono" : "Mute mic")}
                    >
                      {isCallMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                    </button>

                    {/* Central Status Indicator / Send speech now */}
                    <button
                      onClick={() => {
                        if (callState === "listening") {
                          void finishCallTurn();
                        }
                      }}
                      disabled={callState !== "listening"}
                      className={`w-16 h-16 rounded-full flex items-center justify-center backdrop-blur-md border shadow-2xl transition-all ${
                        callState === "speaking"
                          ? "bg-emerald-500/30 border-emerald-400 text-emerald-300 ring-4 ring-emerald-500/20 animate-pulse"
                          : callState === "listening"
                          ? "bg-cyan-500/30 border-cyan-400 text-cyan-300 ring-4 ring-cyan-500/20 hover:scale-105 active:scale-95 cursor-pointer"
                          : "bg-purple-500/30 border-purple-400 text-purple-300 ring-4 ring-purple-500/20"
                      }`}
                      title={callState === "listening" ? (isEs ? "Toca para enviar ya" : "Tap to send now") : (isEs ? "En llamada" : "In call")}
                    >
                      {callState === "thinking" ? (
                        <Loader2 className="w-7 h-7 animate-spin text-purple-400" />
                      ) : callState === "listening" ? (
                        <Mic className="w-7 h-7 text-cyan-300 animate-pulse" />
                      ) : (
                        <Phone className="w-7 h-7 text-emerald-300" />
                      )}
                    </button>

                    {/* Hang Up Button */}
                    <button
                      onClick={handleEndCall}
                      className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-2xl shadow-red-600/50 transition-transform hover:scale-105 active:scale-95"
                      title={isEs ? "Colgar llamada" : "Hang up call"}
                    >
                      <PhoneOff className="w-6 h-6" />
                    </button>
                  </div>
                </div>
              </main>
            ) : (
              <main className="flex-1 flex flex-col bg-[#0b0b0b] border-r border-[#222222] relative overflow-hidden">
                {/* Active Call Banner inside Chat mode if minimized */}
                {callActive && (
                  <div className="h-10 px-4 bg-gradient-to-r from-emerald-950/80 via-black to-emerald-950/80 border-b border-emerald-500/30 flex items-center justify-between z-20 flex-shrink-0 backdrop-blur-md">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span>{isEs ? "En llamada con" : "Call with"} {activeChar.name}</span>
                      <span className="text-zinc-400 font-mono">({formatCallTime(callSeconds)})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCallViewMode("full")}
                        className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                      >
                        {isEs ? "Ver personaje" : "View character"}
                      </button>
                      <button
                        onClick={handleEndCall}
                        className="p-1 rounded-full bg-red-600/80 hover:bg-red-600 text-white transition-colors"
                        title={isEs ? "Colgar" : "Hang up"}
                      >
                        <PhoneOff className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              {/* Top Bar of Active Chat */}
              <div className="h-14 px-3 sm:px-5 bg-[#000000] border-b border-[#222222] flex items-center justify-between z-10 flex-shrink-0 w-full min-w-0">
                {/* Back button & Character Name */}
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <button
                    onClick={() => {
                      setViewMode("explore");
                      navigate("/chat");
                    }}
                    className="p-1.5 rounded-xl bg-[#161616] border border-[#2b2b2b] text-zinc-300 hover:text-white flex-shrink-0"
                    title={isEs ? "Volver a explorar" : "Back to explore"}
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 rounded-full bg-[#161616] border border-[#2b2b2b] text-xs min-w-0">
                    <Heart className="w-3.5 h-3.5 text-[#ff8c00] fill-[#ff8c00] flex-shrink-0" />
                    <span className="font-bold text-white truncate max-w-[90px] sm:max-w-none">
                      {activeChar.name}
                    </span>
                    <span className="text-[#ff8c00] font-bold text-[11px] hidden sm:inline">
                      Lv. {activeChar.affinityLevel}
                    </span>
                  </div>
                </div>

                {/* Right controls */}
                <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                  {isAdmin && (
                    <span
                      className="hidden lg:flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 via-yellow-500/20 to-amber-500/20 border border-amber-500/50 text-amber-300 text-[10px] font-black uppercase tracking-wider shadow-sm"
                      title="Administrador Maestro: marketshopusafl@gmail.com"
                    >
                      <Crown className="w-3 h-3 text-amber-400 fill-amber-400" />
                      <span>ADMIN</span>
                    </span>
                  )}

                  <button
                    onClick={() => setIsAiSettingsOpen(true)}
                    className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#181a24] hover:bg-[#222536] border border-[#2e3146] text-amber-300 font-bold text-xs shadow-md transition-all hover:scale-105 active:scale-95"
                    title={isEs ? "Configurar Modelo de IA (Magnum v4, Euryale, Memoria 32K)" : "Configure AI Model (Magnum v4, Euryale, 32K Memory)"}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[11px] truncate max-w-[100px]">{currentAiModelName}</span>
                  </button>

                  <button
                    onClick={handleStartCall}
                    className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-[#00c853] hover:bg-[#00e676] text-black font-extrabold text-xs shadow-md transition-all hover:scale-105 active:scale-95 flex-shrink-0"
                  >
                    <Video className="w-3.5 h-3.5 fill-black text-black" />
                    <span className="hidden xs:inline sm:inline">{isEs ? "Llamada" : "Call"}</span>
                  </button>

                  {/* Auto-Voice Corneta Toggle in Top Bar */}
                  <button
                    type="button"
                    onClick={toggleChatMute}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                      !isChatMuted
                        ? "bg-[#1f160e] border border-[#ff8c00]/60 text-[#ff8c00] hover:scale-110 shadow-sm shadow-[#ff8c00]/20"
                        : "bg-[#161616] border border-[#2b2b2b] text-zinc-500 hover:text-zinc-300 hover:scale-105"
                    }`}
                    title={
                      !isChatMuted
                        ? (isEs ? "Voz automática activada: se lee el chat en voz alta (Click para silenciar)" : "Auto-voice active: chat speaks automatically (Click to mute)")
                        : (isEs ? "Voz automática desactivada: silencioso (Click para activar voz automática)" : "Auto-voice muted (Click to enable auto-voice)")
                    }
                  >
                    {!isChatMuted ? (
                      <Volume2 className="w-3.5 h-3.5 text-[#ff8c00]" />
                    ) : (
                      <VolumeX className="w-3.5 h-3.5 text-zinc-500" />
                    )}
                  </button>

                  {/* 3-Dots Menu with Configure Character, AI Model (mobile) and Reset Story */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="p-1.5 rounded-xl bg-[#161616] border border-[#2b2b2b] text-zinc-300 hover:text-white transition-colors flex-shrink-0"
                        title={isEs ? "Opciones del personaje" : "Character options"}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 bg-[#121212] border border-[#282828] text-zinc-200 shadow-2xl z-50">
                      <DropdownMenuItem
                        onClick={() => handleOpenEditConfig(activeChar)}
                        className="flex items-center gap-2.5 cursor-pointer hover:bg-white/10 text-xs font-semibold py-2.5"
                      >
                        <Settings className="w-4 h-4 text-zinc-400" />
                        <span>{isEs ? "Configurar personaje" : "Configure character"}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setIsAiSettingsOpen(true)}
                        className="flex items-center gap-2.5 cursor-pointer hover:bg-white/10 text-xs font-semibold py-2.5 sm:hidden"
                      >
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        <span>{isEs ? "Modelo de IA y Memoria" : "AI Model & Memory"}</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-[#242424]" />
                      <DropdownMenuItem
                        onClick={() => handleResetCurrentHistory()}
                        className="flex items-center gap-2.5 cursor-pointer text-red-400 hover:text-red-300 hover:bg-red-950/40 text-xs font-bold py-2.5"
                      >
                        <RotateCcw className="w-4 h-4 text-red-400" />
                        <span>{isEs ? "Restablecer historia" : "Reset story"}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Chat Timeline */}
              <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
                {currentMessages.map((msg) => {
                  const isAssistant = msg.role === "assistant";

                  return (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-2 ${
                        isAssistant ? "justify-start" : "justify-end"
                      }`}
                    >
                      {/* User 3-dots icon on the LEFT of the bubble */}
                      {!isAssistant && (
                        <button className="text-zinc-500 hover:text-zinc-300 p-1 mt-4 flex-shrink-0">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      )}

                      {/* Bubble */}
                      <div
                        className={`
                          relative p-5 rounded-2xl text-[15px] leading-[1.5] max-w-[82%] shadow-md
                          ${
                            isAssistant
                              ? "bg-[#181818] text-[#f0f0f0] rounded-tl-sm border border-[#262626]"
                              : "bg-[#f57c00] text-black font-medium rounded-tr-sm"
                          }
                        `}
                      >
                        {/* Assistant Top-Right Inline Actions: ⋮, ▶, ↻ */}
                        {isAssistant && (
                          <div className="float-right flex items-center gap-2.5 ml-4 mb-1 text-zinc-400">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(msg.content);
                                toast({ description: isEs ? "Copiado al portapapeles" : "Copied to clipboard" });
                              }}
                              className="hover:text-white transition-colors"
                              title={isEs ? "Copiar texto" : "Copy text"}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handlePlayAudio(msg.id, msg.content)}
                              className="hover:text-[#ff8c00] transition-colors"
                              title={isEs ? "Reproducir voz" : "Play voice"}
                            >
                              {playingAudioId === msg.id ? (
                                <Pause className="w-4 h-4 text-[#ff8c00]" />
                              ) : (
                                <Play className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              onClick={() => handleSendMessage()}
                              className="hover:text-[#ff8c00] transition-colors"
                              title={isEs ? "Regenerar" : "Regenerate"}
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          </div>
                        )}

                        <p className="whitespace-pre-line">
                          {msg.content}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {/* Typing indicator */}
                {isTyping && (
                  <div className="flex items-center gap-2 text-xs text-zinc-400 bg-[#161616] border border-[#262626] px-4 py-2 rounded-2xl w-fit">
                    <span>{activeChar.name} {isEs ? "está respondiendo..." : "is typing..."}</span>
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ff8c00] animate-bounce" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ff8c00] animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ff8c00] animate-bounce [animation-delay:300ms]" />
                    </span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input Bar Dock */}
              <div className="p-2 sm:p-3.5 bg-[#0e0e0e] border-t border-[#222222] flex items-center gap-1.5 sm:gap-2 flex-shrink-0 w-full min-w-0">
                <button
                  onClick={handleOpenCreateConfig}
                  className="hidden sm:flex w-9 h-9 rounded-full bg-[#1a1a1a] border border-[#2e2e2e] items-center justify-center text-zinc-400 hover:text-white transition-colors flex-shrink-0"
                  title={isEs ? "Nuevo Personaje" : "New Character"}
                >
                  <Plus className="w-4 h-4" />
                </button>

                <button
                  onClick={() => {
                    setInputText(isEs ? "¿Puedes mandarme una foto exclusiva ahora mismo?" : "Can you send me an exclusive photo right now?");
                  }}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#1a1a1a] border border-[#2e2e2e] flex items-center justify-center text-zinc-400 hover:text-[#ff8c00] transition-colors flex-shrink-0"
                  title={isEs ? "Pedir foto" : "Request photo"}
                >
                  <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>

                <button
                  onClick={handleStartCall}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#1a1a1a] border border-[#2e2e2e] flex items-center justify-center text-zinc-400 hover:text-emerald-400 transition-colors flex-shrink-0"
                  title={isEs ? "Llamada de voz" : "Voice call"}
                >
                  <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>

                <div className="flex-1 min-w-0 bg-[#1a1a1a] border border-[#2e2e2e] focus-within:border-[#ff8c00] rounded-2xl flex items-center px-3 sm:px-4 py-1.5 sm:py-2 transition-colors">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSendMessage();
                    }}
                    placeholder={isEs ? "Escribe un mensaje..." : "Type a message..."}
                    className="w-full min-w-0 bg-transparent text-base sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
                  />
                  <Languages className="w-4 h-4 text-zinc-500 ml-1.5 sm:ml-2 cursor-pointer hover:text-zinc-300 flex-shrink-0" />
                </div>

                <button
                  onClick={handleSendMessage}
                  disabled={!inputText.trim() || isTyping}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-[#ff8c00] hover:bg-amber-500 text-black font-extrabold flex items-center justify-center disabled:opacity-40 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-[#ff8c00]/30 flex-shrink-0"
                >
                  <Send className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>
            </main>
          )}

            {/* ----------------------------------------------------
                RIGHT PANEL: Character Dossier & Gallery
               ---------------------------------------------------- */}
            <aside className="w-[340px] lg:w-[380px] bg-[#000000] flex flex-col overflow-y-auto hidden md:flex flex-shrink-0 z-20">
              {/* Top Stats Bar */}
              <div className="h-12 px-4 bg-[#0a0a0a] border-b border-[#222222] flex items-center justify-between text-xs text-zinc-300 font-bold">
                <button
                  type="button"
                  onClick={toggleChatMute}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                    !isChatMuted
                      ? "bg-[#1f160e] border border-[#ff8c00]/60 text-[#ff8c00] hover:scale-110 shadow-sm shadow-[#ff8c00]/20"
                      : "bg-[#181818] border border-[#2e2e2e] text-zinc-500 hover:text-zinc-300 hover:scale-105"
                  }`}
                  title={
                    !isChatMuted
                      ? (isEs ? "Voz automática activada: se lee el chat en voz alta (Click para silenciar)" : "Auto-voice active: chat speaks automatically (Click to mute)")
                      : (isEs ? "Voz automática desactivada: silencioso (Click para activar voz automática)" : "Auto-voice muted (Click to enable auto-voice)")
                  }
                >
                  {!isChatMuted ? (
                    <Volume2 className="w-3.5 h-3.5 text-[#ff8c00]" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5 text-zinc-500" />
                  )}
                </button>
                <div className="flex items-center gap-3.5 text-xs font-semibold">
                  <span className="flex items-center gap-1">
                    <Camera className="w-3.5 h-3.5 text-[#ff8c00]" /> {activeChar.imageCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <Headphones className="w-3.5 h-3.5 text-[#ff8c00]" /> {activeChar.audioCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <Heart className="w-3.5 h-3.5 text-[#ff8c00] fill-[#ff8c00]" /> {activeChar.likesCount}
                  </span>
                </div>
              </div>

              {/* Large Photo / Video Carousel */}
              <div className="relative aspect-[3/4] bg-black">
                {isVideoMedia ? (
                  <video
                    src={activeMediaUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <img
                    src={activeMediaUrl}
                    alt={activeChar.name}
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-50" />

                {activeChar.gallery.length > 1 && (
                  <>
                    <button
                      onClick={() => setActivePhotoIdx((p) => (p === 0 ? activeChar.gallery.length - 1 : p - 1))}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/90 transition-colors"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setActivePhotoIdx((p) => (p === activeChar.gallery.length - 1 ? 0 : p + 1))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/90 transition-colors"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>

              {/* Profile Info below image */}
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-black text-white tracking-wide">
                      {activeChar.name}
                    </h3>
                    <p className="text-xs text-zinc-400">
                      {isEs ? (activeChar.roleTitleEs || activeChar.roleTitle) : (activeChar.roleTitleEn || activeChar.roleTitle)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleOpenEditConfig(activeChar)}
                    className="px-3.5 py-1.5 rounded-xl bg-[#ff8c00] hover:bg-amber-500 text-black font-extrabold text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <User className="w-3.5 h-3.5 stroke-[2.5]" /> {isEs ? "Perfil" : "Profile"}
                  </button>
                </div>

                <p className="text-xs text-zinc-300 leading-relaxed font-normal">
                  {isEs ? (activeChar.bioEs || activeChar.bio) : (activeChar.bioEn || activeChar.bio)}
                </p>

                {/* Exclusive Photos Grid */}
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    {activeChar.gallery.slice(0, 2).map((img, i) => {
                      const isVid = isMediaVideo(img);
                      return (
                        <div
                          key={i}
                          onClick={() => setActivePhotoIdx(i)}
                          className={`aspect-square rounded-xl overflow-hidden cursor-pointer border ${
                            activePhotoIdx === i ? "border-[#ff8c00] ring-2 ring-[#ff8c00]/50" : "border-[#262626]"
                          } hover:border-[#ff8c00] transition-all bg-black relative`}
                        >
                          {isVid ? (
                            <video src={img} muted playsInline autoPlay loop className="w-full h-full object-cover" />
                          ) : (
                            <img src={img} alt="Thumbnail" className="w-full h-full object-cover" />
                          )}
                        </div>
                      );
                    })}
                    <div
                      onClick={() => setIsPremiumGalleryOpen(true)}
                      title={isEs ? "Abrir galería completa de fotos" : "Open full photo gallery"}
                      className="aspect-square rounded-xl bg-[#141414] border border-[#262626] flex items-center justify-center font-bold text-sm text-zinc-300 cursor-pointer hover:bg-[#1f1f1f] hover:border-[#ff8c00] transition-all"
                    >
                      +{activeChar.imageCount - 2}
                    </div>
                  </div>
                </div>

                {/* Premium Content Banner */}
                <div
                  onClick={() => setIsPremiumGalleryOpen(true)}
                  className="p-3.5 rounded-xl bg-gradient-to-r from-[#200e02] to-[#120701] border border-[#ff8c00]/40 hover:border-[#ff8c00] flex items-center justify-between cursor-pointer transition-all shadow-lg hover:shadow-[#ff8c00]/10"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#ff8c00]/20 flex items-center justify-center text-[#ff8c00]">
                      <Flame className="w-4 h-4 fill-[#ff8c00]" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>{isEs ? "Contenido Premium" : "Premium content"}</span>
                        {isAdmin && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold uppercase border border-amber-500/30">
                            Admin
                          </span>
                        )}
                      </h5>
                      <p className="text-[10px] text-zinc-400">
                        {isAdmin
                          ? (isEs ? "Desbloqueado para tu cuenta de Administrador (Ver Galería)" : "Unlocked for your Administrator account (View Gallery)")
                          : (isEs ? "Fotos y videos exclusivos" : "Exclusive photos & videos")}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#ff8c00]" />
                </div>
              </div>
            </aside>
          </div>
        </div>
      )}

      {/* =========================================================================
          PREMIUM GALLERY & EXCLUSIVE MEDIA VIEWER (With Admin Upload & Controls)
         ========================================================================= */}
      <PremiumGalleryDialog
        open={isPremiumGalleryOpen}
        onOpenChange={setIsPremiumGalleryOpen}
        character={activeChar}
        isAdmin={isAdmin}
        onSaveCharacter={handleSaveCharacter}
        onOpenConfig={(tab) => handleOpenEditConfig(activeChar, tab)}
      />

      {/* =========================================================================
          CHARACTER CONFIG DIALOG (Photos, Carousel, Voice, and Bio)
         ========================================================================= */}
      <ChatCharacterConfigDialog
        character={editingCharacter}
        isNew={isCreatingNew}
        open={isConfigOpen}
        onOpenChange={setIsConfigOpen}
        onSave={handleSaveCharacter}
        onResetHistory={handleResetCurrentHistory}
        initialTab={configInitialTab}
      />

      {/* =========================================================================
          AI MODEL & MEMORY SETTINGS DIALOG (Magnum v4, Euryale 70B, DeepSeek, 32K)
         ========================================================================= */}
      <ChatAiSettingsDialog
        open={isAiSettingsOpen}
        onOpenChange={setIsAiSettingsOpen}
        storyId={activeChar.id}
        onSettingsSaved={(settings) => {
          toast({
            description: isEs
              ? `Modelo de IA guardado: ${currentAiModelName} • Memoria: ${settings.memoryTier.toUpperCase()}`
              : `AI Model saved: ${currentAiModelName} • Memory: ${settings.memoryTier.toUpperCase()}`
          });
        }}
      />
    </div>
  );
}
