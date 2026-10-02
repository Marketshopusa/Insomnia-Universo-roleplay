export interface VoiceOption {
  value: string;
  label: string;
  gender: "female" | "male";
  descriptionEs: string;
  descriptionEn: string;
}

/** Gemini 2.5 Flash TTS voices. scarlett-hd stays Aoede for stories already saved. */
export const STORY_VOICES: VoiceOption[] = [
  { value: "Aoede", label: "Aoede", gender: "female", descriptionEs: "Suave y apasionada", descriptionEn: "Breezy" },
  { value: "Zephyr", label: "Zephyr", gender: "female", descriptionEs: "Brillante y cercana", descriptionEn: "Bright" },
  { value: "Leda", label: "Leda", gender: "female", descriptionEs: "Joven y dulce", descriptionEn: "Youthful" },
  { value: "Kore", label: "Kore", gender: "female", descriptionEs: "Serena y firme", descriptionEn: "Firm" },
  { value: "Achernar", label: "Achernar", gender: "female", descriptionEs: "Suave", descriptionEn: "Soft" },
  { value: "Autonoe", label: "Autonoe", gender: "female", descriptionEs: "Brillante", descriptionEn: "Bright" },
  { value: "Callirrhoe", label: "Callirrhoe", gender: "female", descriptionEs: "Relajada", descriptionEn: "Easy-going" },
  { value: "Despina", label: "Despina", gender: "female", descriptionEs: "Fluida", descriptionEn: "Smooth" },
  { value: "Erinome", label: "Erinome", gender: "female", descriptionEs: "Clara", descriptionEn: "Clear" },
  { value: "Gacrux", label: "Gacrux", gender: "female", descriptionEs: "Madura", descriptionEn: "Mature" },
  { value: "Laomedeia", label: "Laomedeia", gender: "female", descriptionEs: "Animada", descriptionEn: "Upbeat" },
  { value: "Pulcherrima", label: "Pulcherrima", gender: "female", descriptionEs: "Directa", descriptionEn: "Forward" },
  { value: "Sulafat", label: "Sulafat", gender: "female", descriptionEs: "Cálida", descriptionEn: "Warm" },
  { value: "Vindemiatrix", label: "Vindemiatrix", gender: "female", descriptionEs: "Gentil", descriptionEn: "Gentle" },
  { value: "Achird", label: "Achird", gender: "male", descriptionEs: "Amistoso", descriptionEn: "Friendly" },
  { value: "Algenib", label: "Algenib", gender: "male", descriptionEs: "Grave", descriptionEn: "Gravelly" },
  { value: "Algieba", label: "Algieba", gender: "male", descriptionEs: "Suave", descriptionEn: "Smooth" },
  { value: "Alnilam", label: "Alnilam", gender: "male", descriptionEs: "Firme", descriptionEn: "Firm" },
  { value: "Charon", label: "Charon", gender: "male", descriptionEs: "Clara y informativa", descriptionEn: "Informative" },
  { value: "Enceladus", label: "Enceladus", gender: "male", descriptionEs: "Susurrada", descriptionEn: "Breathy" },
  { value: "Fenrir", label: "Fenrir", gender: "male", descriptionEs: "Entusiasta", descriptionEn: "Excitable" },
  { value: "Iapetus", label: "Iapetus", gender: "male", descriptionEs: "Clara", descriptionEn: "Clear" },
  { value: "Orus", label: "Orus", gender: "male", descriptionEs: "Firme", descriptionEn: "Firm" },
  { value: "Puck", label: "Puck", gender: "male", descriptionEs: "Animada", descriptionEn: "Upbeat" },
  { value: "Rasalgethi", label: "Rasalgethi", gender: "male", descriptionEs: "Informativa", descriptionEn: "Informative" },
  { value: "Sadachbia", label: "Sadachbia", gender: "male", descriptionEs: "Viva", descriptionEn: "Lively" },
  { value: "Sadaltager", label: "Sadaltager", gender: "male", descriptionEs: "Pausada", descriptionEn: "Knowledgeable" },
  { value: "Schedar", label: "Schedar", gender: "male", descriptionEs: "Pareja", descriptionEn: "Even" },
  { value: "Umbriel", label: "Umbriel", gender: "male", descriptionEs: "Relajada", descriptionEn: "Easy-going" },
  { value: "Zubenelgenubi", label: "Zubenelgenubi", gender: "male", descriptionEs: "Casual", descriptionEn: "Casual" },
];

export const DEFAULT_VOICE = "Aoede";

const LEGACY_VOICES: Record<string, string> = {
  "scarlett-hd": "Aoede",
  "luna-sweet": "Leda",
  "aria-calm": "Kore",
  "max-deep": "Charon",
  "leo-warm": "Puck",
};

export const normalizeStoryVoice = (value?: string | null) => {
  if (!value) return DEFAULT_VOICE;
  if (STORY_VOICES.some((voice) => voice.value === value)) return value;
  return LEGACY_VOICES[value] ?? DEFAULT_VOICE;
};

export const voiceGender = (value: string): "female" | "male" =>
  STORY_VOICES.find((voice) => voice.value === normalizeStoryVoice(value))?.gender ?? "female";

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
