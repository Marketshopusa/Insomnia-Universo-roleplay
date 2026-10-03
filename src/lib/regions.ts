export interface RegionOption {
  id: string;
  label: string;
  locale: string;
  slang: string;
}

/** México is the default accent. Spain keeps es-ES; the others are Latin American locales. */
export const STORY_REGIONS: RegionOption[] = [
  { id: "ar", label: "Argentina", locale: "es-AR", slang: "Escribe con jerga de Argentina: vos, tenés, che y dale." },
  { id: "ve", label: "Venezuela", locale: "es-VE", slang: "Escribe con jerga de Venezuela: chamo y vale." },
  { id: "co", label: "Colombia", locale: "es-CO", slang: "Escribe con jerga de Colombia: parce, bacano y qué más." },
  { id: "mx", label: "México", locale: "es-MX", slang: "Escribe con jerga de México: órale, ahorita y chido." },
  { id: "es", label: "España", locale: "es-ES", slang: "Escribe con jerga de España: vale, tío y mola." },
  { id: "cl", label: "Chile", locale: "es-CL", slang: "Escribe con jerga de Chile: po, cachai y al tiro." },
];

export const DEFAULT_REGION = "mx";

export const normalizeRegion = (value?: string | null) =>
  STORY_REGIONS.some((region) => region.id === value) ? (value as string) : DEFAULT_REGION;

export const regionById = (value?: string | null) =>
  STORY_REGIONS.find((region) => region.id === normalizeRegion(value)) ?? STORY_REGIONS[3];

export const regionLocale = (value?: string | null) => regionById(value).locale;

/** Chrome's call recognizer rejects several country codes. es-419 covers Latin America. */
export const browserSpeechLocale = (language?: string | null, region?: string | null) => {
  if (language === "en") return "en-US";
  if (region === "plain") return "es-ES";
  const id = normalizeRegion(region);
  if (id === "es") return "es-ES";
  if (id === "mx") return "es-MX";
  return "es-419";
};

const keyFor = (storyId: string) => `insomnia.region.${storyId}`;
const accentKeyFor = (storyId: string) => `insomnia.accent.${storyId}`;

/** A regional voice is opt-in; existing explicit selections remain saved. */
export const getStoryAccent = (storyId?: string) => {
  if (typeof window === "undefined") return false;
  const stored = storyId ? window.localStorage.getItem(accentKeyFor(storyId)) : null;
  const value = stored ?? window.localStorage.getItem("insomnia.accent");
  return value === "1";
};

export const setStoryAccent = (storyId: string | undefined, enabled: boolean) => {
  if (typeof window === "undefined") return;
  const value = enabled ? "1" : "0";
  if (storyId) window.localStorage.setItem(accentKeyFor(storyId), value);
  window.localStorage.setItem("insomnia.accent", value);
};

/** The country stays saved. Off means Gemini's own voice, without a regional accent. */
export const spokenRegion = (region: string, accentEnabled: boolean) =>
  accentEnabled ? normalizeRegion(region) : "plain";

/** The accent chosen for a story stays the same for reading, chat and calls. */
export const getStoryRegion = (storyId?: string) => {
  if (typeof window === "undefined") return DEFAULT_REGION;
  const stored = storyId ? window.localStorage.getItem(keyFor(storyId)) : null;
  const value = stored || window.localStorage.getItem("insomnia.region") || DEFAULT_REGION;
  return normalizeRegion(value);
};

export const setStoryRegion = (storyId: string | undefined, value: string) => {
  if (typeof window === "undefined") return;
  const region = normalizeRegion(value);
  if (storyId) window.localStorage.setItem(keyFor(storyId), region);
  window.localStorage.setItem("insomnia.region", region);
};
