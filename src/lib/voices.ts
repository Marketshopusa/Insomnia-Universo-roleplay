export interface VoiceOption {
  value: string;
  label: string;
  gender: "female";
  descriptionEs: string;
  descriptionEn: string;
}

/** Chirp 3 HD feminine voices. scarlett-hd stays Aoede for stories already saved. */
export const STORY_VOICES: VoiceOption[] = [
  { value: "Aoede", label: "Aoede", gender: "female", descriptionEs: "Suave y apasionada", descriptionEn: "Soft and passionate" },
  { value: "Zephyr", label: "Zephyr", gender: "female", descriptionEs: "Brillante y cercana", descriptionEn: "Bright and close" },
  { value: "Leda", label: "Leda", gender: "female", descriptionEs: "Dulce y juguetona", descriptionEn: "Sweet and playful" },
  { value: "Kore", label: "Kore", gender: "female", descriptionEs: "Serena y firme", descriptionEn: "Calm and firm" },
  { value: "Achernar", label: "Achernar", gender: "female", descriptionEs: "Clara y expresiva", descriptionEn: "Clear and expressive" },
  { value: "Autonoe", label: "Autonoe", gender: "female", descriptionEs: "Cálida y joven", descriptionEn: "Warm and youthful" },
  { value: "Callirrhoe", label: "Callirrhoe", gender: "female", descriptionEs: "Suave y fluida", descriptionEn: "Soft and flowing" },
  { value: "Despina", label: "Despina", gender: "female", descriptionEs: "Ligera y amable", descriptionEn: "Light and kind" },
  { value: "Erinome", label: "Erinome", gender: "female", descriptionEs: "Íntima y baja", descriptionEn: "Intimate and low" },
  { value: "Gacrux", label: "Gacrux", gender: "female", descriptionEs: "Madura y segura", descriptionEn: "Mature and sure" },
  { value: "Laomedeia", label: "Laomedeia", gender: "female", descriptionEs: "Serena y elegante", descriptionEn: "Serene and elegant" },
  { value: "Pulcherrima", label: "Pulcherrima", gender: "female", descriptionEs: "Luminosa y viva", descriptionEn: "Luminous and lively" },
  { value: "Sulafat", label: "Sulafat", gender: "female", descriptionEs: "Cálida y grave", descriptionEn: "Warm and deep" },
  { value: "Vindemiatrix", label: "Vindemiatrix", gender: "female", descriptionEs: "Suave y nocturna", descriptionEn: "Soft and nocturnal" },
];

export const DEFAULT_VOICE = "Aoede";

const LEGACY_VOICES: Record<string, string> = {
  "scarlett-hd": "Aoede",
  "luna-sweet": "Leda",
  "aria-calm": "Kore",
  "max-deep": "Aoede",
  "leo-warm": "Aoede",
  Charon: "Aoede",
  Puck: "Aoede",
};

export const normalizeStoryVoice = (value?: string | null) => {
  if (!value) return DEFAULT_VOICE;
  if (STORY_VOICES.some((voice) => voice.value === value)) return value;
  return LEGACY_VOICES[value] ?? DEFAULT_VOICE;
};

export const voiceGender = (_value: string): "female" => "female";

const keyFor = (storyId: string) => `insomnia.voice.${storyId}`;

/** The voice chosen for a story stays the same for reading, chat and calls. */
export const getStoryVoice = (storyId?: string) => {
  if (typeof window === "undefined") return DEFAULT_VOICE;
  const stored = storyId ? window.localStorage.getItem(keyFor(storyId)) : null;
  const value = stored || window.localStorage.getItem("insomnia.voice") || DEFAULT_VOICE;
  return normalizeStoryVoice(value);
};

export const setStoryVoice = (storyId: string | undefined, value: string) => {
  if (typeof window === "undefined") return;
  const voice = normalizeStoryVoice(value);
  if (storyId) window.localStorage.setItem(keyFor(storyId), voice);
  window.localStorage.setItem("insomnia.voice", voice);
};
