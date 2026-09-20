export interface VoiceOption {
  value: string;
  label: string;
  gender: "female" | "male";
  descriptionEs: string;
  descriptionEn: string;
}

export const STORY_VOICES: VoiceOption[] = [
  {
    value: "scarlett-hd",
    label: "Scarlett HD",
    gender: "female",
    descriptionEs: "Femenina, suave y apasionada",
    descriptionEn: "Female, soft and passionate",
  },
  {
    value: "luna-sweet",
    label: "Luna Sweet",
    gender: "female",
    descriptionEs: "Femenina, dulce y juguetona",
    descriptionEn: "Female, sweet and playful",
  },
  {
    value: "aria-calm",
    label: "Aria Calm",
    gender: "female",
    descriptionEs: "Femenina, serena y elegante",
    descriptionEn: "Female, calm and elegant",
  },
  {
    value: "max-deep",
    label: "Max Deep",
    gender: "male",
    descriptionEs: "Masculina, grave y segura",
    descriptionEn: "Male, deep and confident",
  },
  {
    value: "leo-warm",
    label: "Leo Warm",
    gender: "male",
    descriptionEs: "Masculina, cálida y cercana",
    descriptionEn: "Male, warm and close",
  },
];

export const DEFAULT_VOICE = "scarlett-hd";

export const voiceGender = (value: string): "female" | "male" =>
  STORY_VOICES.find((v) => v.value === value)?.gender ?? "female";

const keyFor = (storyId: string) => `insomnia.voice.${storyId}`;

/** The voice chosen for a story stays the same for reading, chat and calls. */
export const getStoryVoice = (storyId?: string) => {
  if (typeof window === "undefined") return DEFAULT_VOICE;
  const stored = storyId ? window.localStorage.getItem(keyFor(storyId)) : null;
  const value = stored || window.localStorage.getItem("insomnia.voice") || DEFAULT_VOICE;
  return STORY_VOICES.some((v) => v.value === value) ? value : DEFAULT_VOICE;
};

export const setStoryVoice = (storyId: string | undefined, value: string) => {
  if (typeof window === "undefined") return;
  if (storyId) window.localStorage.setItem(keyFor(storyId), value);
  window.localStorage.setItem("insomnia.voice", value);
};
