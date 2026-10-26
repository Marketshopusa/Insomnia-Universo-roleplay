export type MemoryTier = "2k" | "4k" | "16k" | "32k";
export type ModelTier = "free" | "standard" | "premium" | "deluxe";

export interface AiModelOption {
  id: string;
  name: string;
  tier: ModelTier;
  badge: string;
  description: string;
  bullet1: string;
  bullet2: string;
  openRouterModel?: string;
  nvidiaModel?: string;
}

export const AVAILABLE_AI_MODELS: AiModelOption[] = [
  // Gratis
  {
    id: "insomnia-flash",
    name: "Insomnia Flash",
    tier: "free",
    badge: "Free",
    description: "Modelo de IA de pensamiento rápido: respuestas instantáneas, conversaciones fluidas.",
    bullet1: "Creado para chats cotidianos con alta velocidad y eficiencia sin censura.",
    bullet2: "Respuesta promedio en ~1.5 segundos con excelente coherencia en español.",
    nvidiaModel: "meta/llama-3.2-11b-vision-instruct",
  },
  {
    id: "magnum-v4-local",
    name: "Magnum v4 (PC Local / 8788)",
    tier: "free",
    badge: "Local",
    description: "Modelo LLaMA 3.x / Magnum corriendo localmente en tu propia computadora.",
    bullet1: "Privacidad 100% local, cero censura y cero consumo de saldo en la nube.",
    bullet2: "Usa el servidor de tu PC en http://127.0.0.1:8788 con velocidad nativa.",
  },
  {
    id: "mistral-nemo",
    name: "Mistral Nemo (12B)",
    tier: "free",
    badge: "Free",
    description: "Parámetros de 12B para un juego de roles fluido y coherente.",
    bullet1: "Fuerte en conversaciones largas y razonamiento complejo.",
    bullet2: "Mantiene la fidelidad del personaje y acata órdenes físicas al pie de la letra.",
    openRouterModel: "mistralai/mistral-nemo",
    nvidiaModel: "meta/llama-3.2-11b-vision-instruct",
  },
  {
    id: "qwen-3.8-flash",
    name: "Qwen 3.8 Flash",
    tier: "free",
    badge: "Free",
    description: "Intercambios rápidos para juegos de rol cotidianos.",
    bullet1: "Sumérgete en escenas casuales y mantén el diálogo fluido.",
    bullet2: "Excelente manejo de acentos y expresiones directas.",
    openRouterModel: "qwen/qwen-2.5-72b-instruct",
    nvidiaModel: "meta/llama-3.2-11b-vision-instruct",
  },
  {
    id: "glm-5.3-flash",
    name: "GLM 5.3 Flash",
    tier: "free",
    badge: "Free",
    description: "Una opción más ligera para juegos de rol ricos en contexto.",
    bullet1: "Explora escenas construidas en torno a trasfondos detallados de personajes.",
    bullet2: "Rápida adaptación a giros dramáticos en la trama.",
    openRouterModel: "thudm/glm-4-9b-chat",
    nvidiaModel: "meta/llama-3.2-11b-vision-instruct",
  },

  // Standard
  {
    id: "qwen-3.7-plus",
    name: "Qwen 3.7 Plus",
    tier: "standard",
    badge: "Standard",
    description: "Una opción versátil para diálogos y narraciones.",
    bullet1: "Combina conversaciones de personajes con ambientación y narración.",
    bullet2: "Alta sensibilidad psicológica al estado de ánimo del protagonista.",
    openRouterModel: "qwen/qwen-2.5-72b-instruct",
    nvidiaModel: "meta/llama-3.2-11b-vision-instruct",
  },
  {
    id: "qwen-plus",
    name: "Qwen Plus",
    tier: "standard",
    badge: "Standard",
    description: "Modelo de juego de rol insignia: mayor fidelidad a la personalidad.",
    bullet1: "Sólido en conversaciones largas con una empatía más profunda.",
    bullet2: "Rica expresividad en diálogos en voz alta y detalles sensoriales.",
    openRouterModel: "qwen/qwen-2.5-72b-instruct",
    nvidiaModel: "meta/llama-3.2-11b-vision-instruct",
  },

  // Premium
  {
    id: "grok-4.3",
    name: "Grok 4.3",
    tier: "premium",
    badge: "Premium",
    description: "Juego de rol interactivo moldeado por la voz de tu personaje.",
    bullet1: "Ajusta la personalidad, el tono y las reglas de cada escena.",
    bullet2: "Carácter audaz, directo y sin tabúes para tramas apasionadas.",
    openRouterModel: "anthracite-org/magnum-v4-72b",
    nvidiaModel: "meta/llama-3.2-11b-vision-instruct",
  },
  {
    id: "dola-seed-lite",
    name: "Dola Seed 2.0 Lite",
    tier: "premium",
    badge: "Premium",
    description: "Velocidad y detalle equilibrados para escenas de personajes inmersivas.",
    bullet1: "Combina el diálogo de los personajes con una narración que ambienta la escena.",
    bullet2: "Mantiene la proporción cinematográfica ideal sin divagar.",
    openRouterModel: "anthracite-org/magnum-v4-72b",
    nvidiaModel: "meta/llama-3.2-11b-vision-instruct",
  },
  {
    id: "glm-5.2",
    name: "GLM 5.2",
    tier: "premium",
    badge: "Premium",
    description: "Potente modelo de próxima generación para juegos de rol inmersivos.",
    bullet1: "Ofrece diálogos naturales con una gran consistencia de personajes.",
    bullet2: "Comprensión profunda de parentescos y jerarquías familiares.",
    openRouterModel: "anthracite-org/magnum-v4-72b",
    nvidiaModel: "meta/llama-3.2-11b-vision-instruct",
  },
  {
    id: "wizardlm-8x22b",
    name: "WizardLM (8x22B)",
    tier: "premium",
    badge: "Premium",
    description: "Arquitectura masiva 8x22B para narrativas elaboradas.",
    bullet1: "Sobresale en narraciones detalladas y de formato largo.",
    bullet2: "Excelente vocabulario literario y sensorial en español.",
    openRouterModel: "microsoft/wizardlm-2-8x22b",
    nvidiaModel: "meta/llama-3.2-11b-vision-instruct",
  },

  // Deluxe
  {
    id: "euryale-70b",
    name: "Euryale (70B)",
    tier: "deluxe",
    badge: "Deluxe",
    description: "Modelo de 70B ajustado para conversaciones de máxima calidad.",
    bullet1: "Genera respuestas de personajes ricas, detalladas y profundamente inmersivas.",
    bullet2: "Especialista mundial en roleplay adulto sin censura y Dirty Talk.",
    openRouterModel: "sao10k/l3.3-euryale-70b",
    nvidiaModel: "meta/llama-3.2-11b-vision-instruct",
  },
  {
    id: "skylark-pro",
    name: "SkyLark Pro",
    tier: "deluxe",
    badge: "Deluxe",
    description: "Especialista en juegos de rol cálidos e inmersivos con matices emocionales similares a los humanos.",
    bullet1: "Sobresale en personajes consistentes, diálogos naturales y narraciones expresivas.",
    bullet2: "Sensibilidad extrema para dinámicas románticas y de complicidad.",
    openRouterModel: "sao10k/l3.3-euryale-70b",
    nvidiaModel: "meta/llama-3.2-11b-vision-instruct",
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    tier: "deluxe",
    badge: "Deluxe",
    description: "Especialista en diálogo natural y atractivo.",
    bullet1: "Proporciona interacciones fluidas y similares a las humanas con lógica deductiva.",
    bullet2: "Resuelve con maestría situaciones con múltiples personajes presentes en la habitación.",
    openRouterModel: "deepseek/deepseek-chat",
    nvidiaModel: "meta/llama-3.2-11b-vision-instruct",
  },
  {
    id: "dola-seed-pro",
    name: "Dola Seed 2.0 Pro",
    tier: "deluxe",
    badge: "Deluxe",
    description: "Razonamiento profundo para historias complejas guiadas por elecciones.",
    bullet1: "Explora motivos ocultos y deja que cada decisión dé forma a lo que sigue.",
    bullet2: "Cero disociación y memoria fotográfica de eventos anteriores.",
    openRouterModel: "sao10k/l3.3-euryale-70b",
    nvidiaModel: "meta/llama-3.2-11b-vision-instruct",
  },
];

export interface StoryAiSettings {
  memoryTier: MemoryTier;
  messageLength: number; // 100 - 600 tokens
  modelTier: ModelTier;
  modelId: string;
  customDirective: string;
  dialogueRatio?: number;
  narrationRatio?: number;
  openRouterApiKey?: string;
  nvidiaApiKey?: string;
  geminiApiKey?: string;
  adultMode?: boolean;
}

export const DEFAULT_AI_SETTINGS: StoryAiSettings = {
  memoryTier: "16k",
  messageLength: 350,
  modelTier: "free",
  modelId: "insomnia-flash",
  customDirective: "",
  dialogueRatio: 0.80,
  narrationRatio: 0.20,
  openRouterApiKey: "",
  nvidiaApiKey: "",
  geminiApiKey: "",
};

const STORAGE_KEY_PREFIX = "insomnia_story_ai_settings_";

function getMotherCardBaseSettings(): Partial<StoryAiSettings> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem("insomnia_mother_card_config_v2");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.aiSettings) return parsed.aiSettings;
    }
  } catch {}
  return {};
}

export function getStoryAiSettings(storyId?: string | null): StoryAiSettings {
  const motherAi = getMotherCardBaseSettings();
  const base: StoryAiSettings = { ...DEFAULT_AI_SETTINGS, ...motherAi };
  if (typeof window === "undefined") return base;
  try {
    if (storyId) {
      const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${storyId}`);
      if (stored) {
        return { ...base, ...JSON.parse(stored) };
      }
    }
    const globalStored = localStorage.getItem(`${STORAGE_KEY_PREFIX}global`);
    if (globalStored) {
      return { ...base, ...JSON.parse(globalStored) };
    }
  } catch (e) {
    console.warn("Could not read story AI settings from localStorage", e);
  }
  return base;
}

export function setStoryAiSettings(storyId: string | null | undefined, settings: StoryAiSettings): void {
  if (typeof window === "undefined") return;
  try {
    const serialized = JSON.stringify(settings);
    if (storyId) {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${storyId}`, serialized);
    }
    localStorage.setItem(`${STORAGE_KEY_PREFIX}global`, serialized);
  } catch (e) {
    console.warn("Could not save story AI settings to localStorage", e);
  }
}
