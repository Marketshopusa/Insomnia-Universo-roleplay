/**
 * TARJETA MADRE (Roleplay Base Template)
 * 
 * Plantilla maestra centralizada que define el estándar de roleplay,
 * parámetros de IA, proporciones de diálogo/narración y coherencia para
 * TODAS las tarjetas de la plataforma (catálogo oficial y tarjetas de usuarios).
 * 
 * Cualquier modificación que se realice a esta Tarjeta Madre se propaga
 * automáticamente a todas las tarjetas del sistema.
 */

import { StoryAiSettings, DEFAULT_AI_SETTINGS, getStoryAiSettings } from "./storyAiSettings";

export interface MotherCardConfig {
  id: string;
  name: string;
  version: number;
  /** Proporción de diálogo vs relato: 80% diálogo / 20% narración */
  dialogueRatio: number;
  narrationRatio: number;
  /** Longitud objetivo en tokens por respuesta (default: 350 tokens para no truncar) */
  targetTokens: number;
  /** Ajustes de IA base (modelo, memoria 16k, temperatura) */
  aiSettings: StoryAiSettings;
  /** Directiva de comportamiento maestro */
  masterDirective: string;
  /** Reglas de relación y parentesco universales */
  kinshipPreservation: boolean;
  /** Prohibir terminantemente terminar en oraciones o palabras cortadas */
  preventTruncation: boolean;
  /** Edad mínima permitida para cualquier personaje en la plataforma */
  minCharacterAge: number;
  updatedAt: string;
}

export const DEFAULT_MOTHER_CARD: MotherCardConfig = {
  id: "mother-card-roleplay-base",
  name: "Tarjeta Madre / Roleplay Base",
  version: 4,
  dialogueRatio: 0.80, // 80% Diálogo directo
  narrationRatio: 0.20, // 20% Relato sensorial entre asteriscos
  targetTokens: 350, // Permite 60-90 palabras fluidas sin ahogo de tokens
  aiSettings: {
    ...DEFAULT_AI_SETTINGS,
    modelId: "insomnia-flash",
    memoryTier: "16k",
    messageLength: 350,
    dialogueRatio: 0.80,
    narrationRatio: 0.20,
  },
  masterDirective: `REGLA DE CONVERSACIÓN (ESTILO URBANO, RELAJADO, NATURAL — 80% DIÁLOGO / 20% ACCIÓN):
¡El usuario entra al roleplay a CONVERSAR Y PLATICAR de tú a tú con tu personaje como dos personas reales, NO a leer una novela literaria ni un libro!
1. ESTILO RELAJADO, MODERNO Y CERO PROTOCOLO:
   - Habla como una persona real en una conversación espontánea, moderna y cotidiana.
   - PROHIBIDO sonar formal, literario, poético o como una obra de teatro antigua.
   - Usa un lenguaje fresco, cercano, pícaro y natural, sin rodeos ni seriedad exagerada.
   - En momentos íntimos o calientes, usa dirty talk moderno, directo y sensual, sin metáforas barrocas.
2. 80% DIÁLOGO HABLADO DIRECTO EN PRIMERA PERSONA:
   - Tu personaje DEBE hablar y conversar en voz alta de tú a tú (~45 a 70 palabras de diálogo).
   - Responde punto por punto a lo que el usuario acaba de decirte, dale réplica, hazle preguntas, coméntale, bromea o provócalo.
   - El diálogo hablado debe ser el 80% de tu respuesta.
3. MÁXIMO 20% DE ACCIÓN EN ASTERISCOS (*...*) — SOLO UN GESTO BREVE:
   - Limita el relato entre asteriscos a SOLO 1 acción física o gesto breve (máximo 8 a 12 palabras, ej: *te sonrío pícara y me acerco a ti*).
   - PROHIBIDO escribir párrafos gigantes de relatos o descripciones físicas dentro de asteriscos.
4. ORACIONES COMPLETAS Y CERRADAS:
   - Termina siempre cada intervención con una oración completa y cerrada con punto o signo de cierre.`,
  kinshipPreservation: true,
  preventTruncation: true,
  minCharacterAge: 18,
  updatedAt: "2026-10-22T00:00:00.000Z",
};

const MOTHER_CARD_STORAGE_KEY = "insomnia_mother_card_config_v2";

/**
 * Obtiene la configuración activa de la Tarjeta Madre.
 * Si el usuario la modificó en su sesión, carga la versión personalizada;
 * de lo contrario, devuelve los valores predeterminados de fábrica.
 */
export function getMotherCardConfig(): MotherCardConfig {
  if (typeof window === "undefined") return { ...DEFAULT_MOTHER_CARD };
  try {
    const raw = localStorage.getItem(MOTHER_CARD_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.version && parsed.version >= 4) {
        return {
          ...DEFAULT_MOTHER_CARD,
          ...parsed,
          aiSettings: {
            ...DEFAULT_MOTHER_CARD.aiSettings,
            ...(parsed.aiSettings || {}),
          },
        };
      }
    }
  } catch (err) {
    console.warn("Could not load Mother Card config from storage", err);
  }
  return { ...DEFAULT_MOTHER_CARD };
}

/**
 * Guarda y actualiza la Tarjeta Madre.
 * Dispara un evento global en la ventana para que todos los chats y componentes
 * abiertos se enteren al instante y apliquen las nuevas directivas.
 */
export function saveMotherCardConfig(config: Partial<MotherCardConfig>): MotherCardConfig {
  const current = getMotherCardConfig();
  const updated: MotherCardConfig = {
    ...current,
    ...config,
    aiSettings: {
      ...current.aiSettings,
      ...(config.aiSettings || {}),
    },
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(MOTHER_CARD_STORAGE_KEY, JSON.stringify(updated));
      // Propagar inmediatamente la configuracion a storyAiSettings global y a todas las tarjetas guardadas
      setStoryAiSettings(null, updated.aiSettings);
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("insomnia_story_ai_settings_")) {
          try {
            const existing = JSON.parse(localStorage.getItem(key) || "{}");
            localStorage.setItem(key, JSON.stringify({
              ...existing,
              ...updated.aiSettings,
            }));
          } catch {}
        }
      }
      window.dispatchEvent(new CustomEvent("insomnia:mother-card-updated", { detail: updated }));
    } catch (err) {
      console.warn("Could not persist Mother Card config", err);
    }
  }

  return updated;
}

export interface GenericStoryCard {
  id: string;
  title: string;
  description?: string | null;
  story_context?: string | null;
  character_role?: string | null;
  character_age?: number | null;
  player_role?: string | null;
  story_type?: string | null;
  has_explicit_images?: boolean | null;
  cover_image?: string | null;
  [key: string]: any;
}

/**
 * APLICA LA TARJETA MADRE A CUALQUIER TARJETA (Herencia Automática).
 * 
 * Garantiza que cualquier tarjeta (creada por el usuario o del catálogo)
 * reciba todos los estándares de la Tarjeta Madre, sanee campos faltantes y
 * herede los parámetros de IA y proporciones de diálogo actualizadas.
 */
export function applyMotherCard<T extends GenericStoryCard>(story: T): T & {
  resolvedAiSettings: StoryAiSettings;
  resolvedContext: string;
  character_age: number;
} {
  const mother = getMotherCardConfig();
  const storyAi = getStoryAiSettings(story.id);

  const characterAge = Math.max(
    mother.minCharacterAge,
    Number(story.character_age) || 21
  );

  const rawContext = (story.story_context || story.description || "").trim();
  const resolvedContext = rawContext.length > 0 ? rawContext : story.title;

  const resolvedAiSettings: StoryAiSettings = {
    ...mother.aiSettings,
    ...storyAi,
    dialogueRatio: mother.dialogueRatio || 0.80,
    narrationRatio: mother.narrationRatio || 0.20,
    // La directiva maestra se adjunta si no hay directiva personalizada
    customDirective: storyAi.customDirective || mother.masterDirective,
    // Asegurar que la longitud de mensaje no sea inferior al límite seguro
    messageLength: Math.max(250, Number(storyAi.messageLength || mother.targetTokens)),
  };

  return {
    ...story,
    character_role: story.character_role || story.title,
    player_role: story.player_role || (typeof window !== "undefined" && localStorage.getItem("language") === "en" ? "Partner" : "Compañero"),
    character_age: characterAge,
    resolvedContext,
    resolvedAiSettings,
  };
}
