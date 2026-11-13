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

export const MAGNUM_CONVERSATION_MODEL = "magnum-conversation";
export const FACTORY_CONVERSATION_DIRECTIVE = `IDENTIDAD, MEMORIA Y CONVERSACIÓN:
1. Interpreta el personaje y la relación definidos en la tarjeta actual. No inventes profesiones, edades, géneros ni relaciones.
2. Cada tarjeta mantiene su propia historia. La configuración general define el estilo, nunca aporta recuerdos ni escenas.
3. Responde al último mensaje respetando lo que ya ocurrió. No reinicies ni cambies de interlocutor por una simple mención.
4. El usuario dirige su personaje. No escribas sus diálogos, decisiones ni sentimientos.
5. Habla con naturalidad en el idioma elegido. Evita repeticiones y termina las oraciones.
6. Mantén aproximadamente 80% de diálogo y 20% de acciones breves cuando la escena lo permita.
7. Las expresiones vocales y los efectos deben ser breves y corresponder a la escena. No prolongues risas ni sonidos sin motivo.`;
export function isLegacyFactoryConversation(config: { version?: number; updatedAt?: string; masterDirective?: string; aiSettings?: { modelId?: string } }) {
  return config.version === 6 && config.updatedAt === "2026-10-22T00:00:00.000Z" && config.masterDirective === FACTORY_CONVERSATION_DIRECTIVE && config.aiSettings?.modelId === "insomnia-flash";
}

export const AVAILABLE_AI_MODELS: AiModelOption[] = [
  {
    id: MAGNUM_CONVERSATION_MODEL,
    name: "Magnum · conversación no explícita",
    tier: "free", badge: "PC",
    description: "Magnum real de tu PC para conversación no sexual y romance no explícito.",
    bullet1: "Reacción y diálogo, normalmente 90–150 palabras; más breve cuando corresponda.",
    bullet2: "Requiere el PC encendido y conectado. La voz mantiene la selección del personaje.",
  },
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
  nonExplicitConversation?: boolean;
}

export const DEFAULT_AI_SETTINGS: StoryAiSettings = {
  memoryTier: "16k",
  messageLength: 350,
  modelTier: "free",
  modelId: MAGNUM_CONVERSATION_MODEL,
  customDirective: "",
  dialogueRatio: 0.80,
  narrationRatio: 0.20,
  openRouterApiKey: "",
  nvidiaApiKey: "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",
  geminiApiKey: "",
};

const STORAGE_KEY_PREFIX = "insomnia_story_ai_settings_";

/** One-time upgrade of the former default; other chosen models stay per-card. */
function migrateMagnumConversationDefaults() {
  if (typeof window === "undefined" || localStorage.getItem("insomnia_magnum_conversation_primary_v1")) return;
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(STORAGE_KEY_PREFIX) || key === `${STORAGE_KEY_PREFIX}global`) continue;
      try {
        const value = JSON.parse(localStorage.getItem(key) || "null");
        if (value?.modelId === "insomnia-flash" && value.adultMode !== true) localStorage.setItem(key, JSON.stringify({ ...value, modelId: MAGNUM_CONVERSATION_MODEL }));
      } catch { /* Preserve an unreadable entry for recovery. */ }
    }
    const key = "insomnia_mother_card_config_v2";
    const mother = JSON.parse(localStorage.getItem(key) || "null");
    if (mother?.aiSettings?.modelId === "insomnia-flash" && mother.aiSettings.adultMode !== true) {
      localStorage.setItem(key, JSON.stringify({ ...mother, aiSettings: { ...mother.aiSettings, modelId: MAGNUM_CONVERSATION_MODEL } }));
    }
    localStorage.setItem("insomnia_magnum_conversation_primary_v1", "1");
  } catch { /* Defaults still work if storage is unavailable. */ }
}

function getMotherCardBaseSettings(): Partial<StoryAiSettings> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem("insomnia_mother_card_config_v2");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.aiSettings) return isLegacyFactoryConversation(parsed) ? { ...parsed.aiSettings, modelId: MAGNUM_CONVERSATION_MODEL } : parsed.aiSettings;
    }
  } catch {}
  return {};
}

export function getStoryAiSettings(storyId?: string | null): StoryAiSettings {
  migrateMagnumConversationDefaults();
  const motherAi = getMotherCardBaseSettings();
  const base: StoryAiSettings = { ...DEFAULT_AI_SETTINGS, ...motherAi };
  if (typeof window === "undefined") return base;
  try {
    const globalStored = localStorage.getItem(`${STORAGE_KEY_PREFIX}defaults_v2`);
    const defaults: StoryAiSettings = globalStored ? { ...base, ...JSON.parse(globalStored) } : base;
    if (storyId) {
      const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${storyId}`);
      if (stored) {
        return { ...defaults, ...JSON.parse(stored) };
      }
    }
    // The legacy global key was also written by per-card saves. Its origin is ambiguous.
    return defaults;
  } catch (e) {
    console.warn("Could not read story AI settings from localStorage", e);
  }
  return base;
}

export function isMagnumConversationSelected(storyId?: string | null): boolean {
  if (typeof window === "undefined" || !storyId) return false;
  try {
    const value = JSON.parse(localStorage.getItem(`${STORAGE_KEY_PREFIX}${storyId}`) || "null");
    return value?.modelId === MAGNUM_CONVERSATION_MODEL && value.nonExplicitConversation === true;
  } catch { return false; }
}

export function setStoryAiSettings(storyId: string | null | undefined, settings: StoryAiSettings): void {
  migrateMagnumConversationDefaults();
  if (typeof window === "undefined") return;
  try {
    const nonExplicitConversation = settings.modelId === MAGNUM_CONVERSATION_MODEL;
    const serialized = JSON.stringify({ ...settings, nonExplicitConversation, ...(nonExplicitConversation ? { adultMode: false } : {}) });
    if (storyId) {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${storyId}`, serialized);
    } else {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}defaults_v2`, serialized);
    }
  } catch (e) {
    console.warn("Could not save story AI settings to localStorage", e);
  }
}
