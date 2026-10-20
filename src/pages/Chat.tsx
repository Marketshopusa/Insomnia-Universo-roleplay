import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Send,
  Video,
  Mic,
  MicOff,
  Volume2,
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
  Shuffle,
  Headphones,
  ArrowLeft,
  Languages,
  PhoneOff,
  MessageSquare
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAdultMode } from "@/contexts/AdultModeContext";
import { invokeFunctionWithRetry } from "@/lib/invokeFunction";
import { streamSpeech, type SpeechStream } from "@/lib/ttsStream";
import { selectStoryMemory } from "@/lib/storyMemory";
import { ChatCharacterConfigDialog, fallbackFemaleSpeech } from "@/components/chat/ChatCharacterConfigDialog";
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
      "https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/a395f30ef27cd9ab4d89161cc545b327/DYu9SrHkS22_01.jpg"
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
      "https://media.talkiemate.com/app/uploads/growtype-ai-uploads/models/6e536eb2557dae8758d22c1a447bdcc1/3607698674122377796_308603391.jpg"
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

export default function ChatPage() {
  const { characterId } = useParams<{ characterId?: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isEs = language === "es";
  const { enabled: adultEnabled } = useAdultMode();

  // State: View Mode ('explore' for Catalog, 'room' for Chat Room)
  const [viewMode, setViewMode] = useState<"explore" | "room">(
    characterId ? "room" : "explore"
  );
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>(
    characterId || "olivia-adams"
  );

  // Explore Filters
  const [activeGender, setActiveGender] = useState<"all" | "female" | "male" | "non-binary">("all");
  const [activeStyle, setActiveStyle] = useState<"all" | "realistic" | "anime">("all");

  // Dynamic Characters List (persisted in localStorage, allows creating and modifying characters)
  const [characterList, setCharacterList] = useState<CharacterItem[]>(() => {
    try {
      const saved = localStorage.getItem("talkiemate_custom_chars_v2");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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

  const handleOpenEditConfig = (char: CharacterItem) => {
    setEditingCharacter(char);
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

  // Chat inputs
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);

  // Live Call Dialog
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [isCallMuted, setIsCallMuted] = useState(false);

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

  // Messages for active character: Only clean starter message if no conversation yet
  const currentMessages = useMemo(() => {
    const history = chatHistory[activeChar.id];
    if (!history || history.length === 0) {
      const greeting = isEs
        ? (activeChar.starterMessageEs || activeChar.starterMessage)
        : (activeChar.starterMessageEn || activeChar.starterMessage);
      return [
        {
          id: `starter-${activeChar.id}`,
          role: "assistant" as const,
          content: greeting,
          timestamp: isEs ? "Ahora" : "Just now"
        }
      ];
    }
    return history;
  }, [chatHistory, activeChar, isEs]);

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

    setChatHistory((prev) => {
      const existing = prev[activeChar.id] || [initialStarter];
      return {
        ...prev,
        [activeChar.id]: [...existing, userMsg]
      };
    });
    setInputText("");
    setIsTyping(true);

    try {
      const existingHistory = chatHistory[activeChar.id] || [initialStarter];
      const historyPayload = [...existingHistory, userMsg].slice(-8).map((m) => ({
        role: m.role,
        content: m.content
      }));

      const charBio = isEs ? (activeChar.bioEs || activeChar.bio) : (activeChar.bioEn || activeChar.bio);
      const charRole = isEs ? (activeChar.roleTitleEs || activeChar.roleTitle) : (activeChar.roleTitleEn || activeChar.roleTitle);

      const { data, error } = await invokeFunctionWithRetry<{ content?: string }>("story-chat", {
        story: {
          id: activeChar.id,
          title: activeChar.name,
          description: charBio,
          story_context: `${charRole}. Bio: ${charBio}`,
          character_role: activeChar.name,
          player_role: isEs ? "Compañero" : "Partner",
          story_type: "roleplay"
        },
        language,
        history: historyPayload,
        memory: selectStoryMemory(historyPayload, text),
        userMessage: text,
        adultMode: adultEnabled,
        region: "mx"
      });

      let reply = "";
      if (!error && data?.content) {
        reply = data.content;
      } else {
        const fallbacksEs = [
          `Mmm, me encanta cuando me hablas así... Ven y cuéntame todo lo que tienes en mente.`,
          `Me tienes completamente fascinada contigo... No me dejes con la duda, dime más.`,
          `Eres increíble... Me encanta cómo piensas y disfruto cada instante que pasamos juntos.`
        ];
        const fallbacksEn = [
          `Mmm, I love when you talk to me like that... Tell me everything on your mind.`,
          `You have me completely captivated... Don't keep me waiting, tell me more.`,
          `You're amazing... I really enjoy every single moment we spend together.`
        ];
        const choices = isEs ? fallbacksEs : fallbacksEn;
        reply = choices[Math.floor(Math.random() * choices.length)];
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
    }
    setPlayingAudioId(null);
  };

  // Play audio with Insomnia's native expressive speech engine
  const handlePlayAudio = async (messageId: string, text: string) => {
    if (playingAudioId === messageId) {
      stopAudio();
      return;
    }

    stopAudio();
    setPlayingAudioId(messageId);

    const spoken = text.replace(/\*.*?\*/g, "").trim() || text;
    const voiceToUse = activeChar.voiceName || "Aoede";

    try {
      const stream = streamSpeech(spoken, voiceToUse, language, true, "mx");
      speechStreamRef.current = stream;
      await stream.done;
      if (speechStreamRef.current === stream) {
        speechStreamRef.current = null;
        setPlayingAudioId(null);
      }
    } catch (err) {
      console.warn("streamSpeech fallback to guaranteed female speech:", err);
      fallbackFemaleSpeech(spoken, () => {
        speechStreamRef.current = null;
        setPlayingAudioId(null);
      });
    }
  };

  // Voice Call
  const handleStartCall = () => {
    stopAudio();
    setIsCallOpen(true);
    setCallActive(false);
    setTimeout(() => {
      setCallActive(true);
      const greeting = isEs
        ? `Hola cariño... me alegra tanto que me hayas llamado. Cuéntame qué estás haciendo ahora mismo.`
        : `Hey there... I'm so glad you called me. Tell me what you're doing right now.`;
      handlePlayAudio("call-intro", greeting);
    }, 1200);
  };

  const handleEndCall = () => {
    stopAudio();
    setIsCallOpen(false);
    setCallActive(false);
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
    <div className="flex flex-col h-screen w-screen bg-[#000000] text-zinc-100 font-sans select-none overflow-hidden">
      {/* Insomnia Header */}
      <Header />

      {/* =========================================================================
          VIEW 1: TALKIEMATE CHARACTER & STORIES HUB
         ========================================================================= */}
      {viewMode === "explore" && (
        <div className="flex-1 overflow-y-auto max-w-[1440px] w-full mx-auto px-4 md:px-8 py-6 space-y-8">
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
                  <div className="w-full h-full rounded-full overflow-hidden border-2 border-black">
                    <img
                      src={char.avatar}
                      alt={char.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    />
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
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h3 className="text-xl md:text-2xl font-bold text-white tracking-wide flex items-center gap-2">
                {isEs ? "Explorar" : "Explore"} <span className="text-[#ff8c00]">{isEs ? "Experiencias Destacadas" : "Featured Experiences"}</span>
              </h3>

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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {filteredExploreChars.map((char) => {
                const shortBioText = isEs
                  ? (char.shortBioEs || char.shortBio)
                  : (char.shortBioEn || char.shortBio);

                return (
                  <div
                    key={char.id}
                    onClick={() => handleOpenChat(char.id)}
                    className="group relative rounded-2xl overflow-hidden aspect-[9/15] bg-[#141414] border border-[#242424] hover:border-[#ff8c00] cursor-pointer transition-all shadow-md hover:shadow-xl hover:shadow-[#ff8c00]/10 flex flex-col justify-end"
                  >
                    <img
                      src={char.avatar}
                      alt={char.name}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

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
                LEFT PANEL: "Conversations"
               ---------------------------------------------------- */}
            <aside className="w-[260px] lg:w-[280px] bg-[#000000] border-r border-[#222222] flex flex-col flex-shrink-0 z-20">
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
                  <Plus className="w-3.5 h-3.5 stroke-[3]" /> {isEs ? "+ Crear Personaje / Chat" : "+ Add Character / Chat"}
                </button>
              </div>
            </aside>

            {/* ----------------------------------------------------
                CENTER PANEL: Chat Feed
               ---------------------------------------------------- */}
            <main className="flex-1 flex flex-col bg-[#0b0b0b] border-r border-[#222222] relative overflow-hidden">
              {/* Top Bar of Active Chat */}
              <div className="h-14 px-5 bg-[#000000] border-b border-[#222222] flex items-center justify-between z-10 flex-shrink-0">
                {/* Level & XP pill */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#161616] border border-[#2b2b2b] text-xs">
                    <Heart className="w-3.5 h-3.5 text-[#ff8c00] fill-[#ff8c00]" />
                    <span className="font-bold text-white">
                      Lv. {activeChar.affinityLevel} - {isEs ? (activeChar.affinityTitleEs || activeChar.affinityTitle) : (activeChar.affinityTitleEn || activeChar.affinityTitle)}
                    </span>
                    <span className="text-[#ff8c00] font-bold">{activeChar.affinityXp || 70} XP</span>
                    <Info className="w-3.5 h-3.5 text-zinc-500 cursor-pointer hover:text-white" />
                  </div>
                </div>

                {/* Right controls */}
                <div className="flex items-center gap-2 sm:gap-2.5">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#161616] border border-[#2b2b2b]">
                    <img
                      src={activeChar.avatar}
                      alt={activeChar.name}
                      className="w-4 h-4 rounded-full object-cover"
                    />
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-[#ff8c00] text-black font-extrabold">
                      OFF
                    </span>
                  </div>

                  <button
                    onClick={handleStartCall}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00c853] hover:bg-[#00e676] text-black font-extrabold text-xs shadow-md transition-all hover:scale-105 active:scale-95"
                  >
                    <Video className="w-3.5 h-3.5 fill-black text-black" />
                    <span>{isEs ? "Llamada en vivo" : "Live Call"}</span>
                  </button>

                  <button
                    onClick={() => handleOpenEditConfig(activeChar)}
                    className="p-1.5 rounded-xl bg-[#161616] border border-[#2b2b2b] text-zinc-300 hover:text-white"
                    title={isEs ? "Configurar personaje" : "Configure character"}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
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
              <div className="p-3.5 bg-[#0e0e0e] border-t border-[#222222] flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={handleOpenCreateConfig}
                  className="w-9 h-9 rounded-full bg-[#1a1a1a] border border-[#2e2e2e] flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                  title={isEs ? "Nuevo Personaje" : "New Character"}
                >
                  <Plus className="w-4 h-4" />
                </button>

                <button
                  onClick={() => {
                    setInputText(isEs ? "¿Puedes mandarme una foto exclusiva ahora mismo?" : "Can you send me an exclusive photo right now?");
                  }}
                  className="w-9 h-9 rounded-full bg-[#1a1a1a] border border-[#2e2e2e] flex items-center justify-center text-zinc-400 hover:text-[#ff8c00] transition-colors"
                  title={isEs ? "Pedir foto" : "Request photo"}
                >
                  <Camera className="w-4 h-4" />
                </button>

                <button
                  onClick={handleStartCall}
                  className="w-9 h-9 rounded-full bg-[#1a1a1a] border border-[#2e2e2e] flex items-center justify-center text-zinc-400 hover:text-emerald-400 transition-colors"
                  title={isEs ? "Llamada de voz" : "Voice call"}
                >
                  <Mic className="w-4 h-4" />
                </button>

                <div className="flex-1 bg-[#1a1a1a] border border-[#2e2e2e] focus-within:border-[#ff8c00] rounded-2xl flex items-center px-4 py-2 transition-colors">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSendMessage();
                    }}
                    placeholder={isEs ? "Escribe un mensaje..." : "Type a message..."}
                    className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
                  />
                  <Languages className="w-4 h-4 text-zinc-500 ml-2 cursor-pointer hover:text-zinc-300" />
                </div>

                <button
                  onClick={handleSendMessage}
                  disabled={!inputText.trim() || isTyping}
                  className="w-10 h-10 rounded-2xl bg-[#ff8c00] hover:bg-amber-500 text-white font-extrabold flex items-center justify-center disabled:opacity-40 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-[#ff8c00]/30"
                >
                  <Send className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>
            </main>

            {/* ----------------------------------------------------
                RIGHT PANEL: Character Dossier & Gallery
               ---------------------------------------------------- */}
            <aside className="w-[340px] lg:w-[380px] bg-[#000000] flex flex-col overflow-y-auto hidden md:flex flex-shrink-0 z-20">
              {/* Top Stats Bar */}
              <div className="h-12 px-4 bg-[#0a0a0a] border-b border-[#222222] flex items-center justify-between text-xs text-zinc-300 font-bold">
                <span className="w-7 h-7 rounded-full bg-[#181818] flex items-center justify-center text-[#ff8c00]">
                  <Volume2 className="w-3.5 h-3.5" />
                </span>
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

              {/* Large Photo Carousel */}
              <div className="relative aspect-[3/4] bg-black">
                <img
                  src={activeChar.gallery[activePhotoIdx] || activeChar.avatar}
                  alt={activeChar.name}
                  className="w-full h-full object-cover"
                />
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
                    {activeChar.gallery.slice(0, 2).map((img, i) => (
                      <div
                        key={i}
                        onClick={() => setActivePhotoIdx(i)}
                        className="aspect-square rounded-xl overflow-hidden cursor-pointer border border-[#262626] hover:border-[#ff8c00] transition-all"
                      >
                        <img src={img} alt="Thumbnail" className="w-full h-full object-cover" />
                      </div>
                    ))}
                    <div
                      onClick={() => {
                        toast({
                          description: isEs
                            ? `Desbloquea ${activeChar.imageCount - 2}+ fotos exclusivas en modo Premium`
                            : `Unlock ${activeChar.imageCount - 2}+ exclusive photos in Premium mode`
                        });
                      }}
                      className="aspect-square rounded-xl bg-[#141414] border border-[#262626] flex items-center justify-center font-bold text-sm text-zinc-300 cursor-pointer hover:bg-[#1f1f1f] transition-colors"
                    >
                      +{activeChar.imageCount - 2}
                    </div>
                  </div>
                </div>

                {/* Premium Content Banner */}
                <div
                  onClick={() => {
                    toast({
                      description: isEs
                        ? `Acceso exclusivo a fotos y videos premium de ${activeChar.name}`
                        : `Exclusive access to premium photos and videos of ${activeChar.name}`
                    });
                  }}
                  className="p-3.5 rounded-xl bg-gradient-to-r from-[#200e02] to-[#120701] border border-[#ff8c00]/30 hover:border-[#ff8c00] flex items-center justify-between cursor-pointer transition-all shadow-lg"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#ff8c00]/20 flex items-center justify-center text-[#ff8c00]">
                      <Flame className="w-4 h-4 fill-[#ff8c00]" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-white">
                        {isEs ? "Contenido Premium" : "Premium content"}
                      </h5>
                      <p className="text-[10px] text-zinc-400">
                        {isEs ? "Fotos y videos exclusivos" : "Exclusive photos & videos"}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-400" />
                </div>
              </div>
            </aside>
          </div>
        </div>
      )}

      {/* =========================================================================
          LIVE CALL DIALOG (Insomnia Expressive Speech Synthesis)
         ========================================================================= */}
      <Dialog
        open={isCallOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleEndCall();
          } else {
            setIsCallOpen(true);
          }
        }}
      >
        <DialogContent className="max-w-md bg-[#0a0a0a] border border-[#262626] text-white p-6 rounded-3xl shadow-2xl">
          <div className="flex flex-col items-center text-center space-y-6 py-4">
            {/* Status badge */}
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold tracking-wider uppercase">
              <span className={`w-2 h-2 rounded-full ${callActive ? "bg-emerald-400 animate-pulse" : "bg-amber-400 animate-ping"}`} />
              {callActive ? (isEs ? "En llamada en vivo" : "Live call active") : (isEs ? "Conectando..." : "Connecting...")}
            </div>

            {/* Glowing / Pulsing Avatar */}
            <div className="relative">
              <div
                className={`w-32 h-32 rounded-full overflow-hidden ring-4 transition-all duration-500 ${
                  callActive
                    ? "ring-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.4)] scale-105"
                    : "ring-[#ff8c00] animate-pulse"
                }`}
              >
                <img
                  src={activeChar.avatar}
                  alt={activeChar.name}
                  className="w-full h-full object-cover"
                />
              </div>
              {callActive && (
                <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-emerald-500 text-black flex items-center justify-center font-bold shadow-lg">
                  <Volume2 className="w-4 h-4 animate-bounce" />
                </div>
              )}
            </div>

            {/* Character Info */}
            <div className="space-y-1">
              <h3 className="text-xl font-extrabold text-white tracking-wide">{activeChar.name}</h3>
              <p className="text-xs text-zinc-400">
                {isEs ? (activeChar.roleTitleEs || activeChar.roleTitle) : (activeChar.roleTitleEn || activeChar.roleTitle)}
              </p>
            </div>

            {/* Audio Wave Indicator */}
            <div className="w-full min-h-[36px] flex items-center justify-center">
              {callActive ? (
                <div className="flex items-center gap-1.5 h-7">
                  {[35, 75, 100, 60, 85, 40, 95, 70, 30].map((h, i) => (
                    <span
                      key={i}
                      className="w-1 bg-emerald-400 rounded-full animate-pulse"
                      style={{
                        height: `${h}%`,
                        animationDuration: `${0.35 + (i % 4) * 0.15}s`
                      }}
                    />
                  ))}
                </div>
              ) : (
                <span className="text-xs text-zinc-500">
                  {isEs ? "Iniciando voz de Insomnia..." : "Starting Insomnia voice..."}
                </span>
              )}
            </div>

            {/* Call Action Controls */}
            <div className="flex items-center gap-5 pt-2">
              <button
                onClick={() => setIsCallMuted(!isCallMuted)}
                className={`w-12 h-12 rounded-full border flex items-center justify-center transition-colors ${
                  isCallMuted
                    ? "bg-red-500/20 border-red-500 text-red-400"
                    : "bg-[#181818] border-[#2e2e2e] text-zinc-300 hover:text-white"
                }`}
                title={isCallMuted ? (isEs ? "Activar micrófono" : "Unmute mic") : (isEs ? "Silenciar micrófono" : "Mute mic")}
              >
                {isCallMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              <button
                onClick={handleEndCall}
                className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-600/40 transition-transform hover:scale-105 active:scale-95"
                title={isEs ? "Finalizar llamada" : "End call"}
              >
                <PhoneOff className="w-6 h-6" />
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* =========================================================================
          CHARACTER CONFIG DIALOG (Photos, Carousel, Voice, and Bio)
         ========================================================================= */}
      <ChatCharacterConfigDialog
        character={editingCharacter}
        isNew={isCreatingNew}
        open={isConfigOpen}
        onOpenChange={setIsConfigOpen}
        onSave={handleSaveCharacter}
      />
    </div>
  );
}
