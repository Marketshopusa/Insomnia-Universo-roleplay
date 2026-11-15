/** Shared accent + slang. México is the default. Spain uses es-ES. */
export const REGIONS = {
  ar: { label: "Argentina (Buenos Aires)", locale: "es-AR", slang: "Escribe con jerga de Argentina: vos, tenés, che y dale." },
  ve: { label: "Venezuela (Caracas)", locale: "es-VE", slang: "Escribe con jerga de Venezuela: chamo y vale." },
  co: { label: "Colombia (Medellín)", locale: "es-CO", slang: "Escribe con jerga de Colombia: parce, bacano y qué más." },
  mx: { label: "México (CDMX)", locale: "es-MX", slang: "Escribe con jerga de México: órale, ahorita y chido." },
  es: { label: "España (Madrid)", locale: "es-ES", slang: "Escribe con jerga de España: vale, tío y mola." },
  cl: { label: "Chile (Santiago)", locale: "es-CL", slang: "Escribe con jerga de Chile: po, cachai y al tiro." },
};

export function normalizeRegion(value) {
  return Object.prototype.hasOwnProperty.call(REGIONS, value) ? value : "mx";
}

export function speechLocale(language, region) {
  if (language === "en") return "en-US";
  if (region === "plain") return "es-ES";
  const id = normalizeRegion(region);
  if (id === "es") return "es-ES";
  if (id === "mx") return "es-MX";
  return "es-419";
}

export function slangInstruction(language, region) {
  // A region selection should never force stock expressions into character dialogue.
  return "";
}

const ACCENT = {
  ar: "rioplatense urbano de Buenos Aires, estilo porteño contemporáneo, vivaz, alegre, suspicaz, seguro y con picardía; entonación porteña natural, fluida y seductora, sin exageraciones ni monotonía",
  ve: "venezolano urbano de Caracas, estilo caraqueño contemporáneo, educado, fresco y sofisticado; cero tono campesino, cero tono bobo o infantil, dicción clara, ritmo fluido y natural",
  co: "colombiano de Medellín, estilo paisa urbano contemporáneo, suave, melódico, encantador, seguro y fluido; cero acento campesino o pueblerino, cero tono infantil o bobo; cadencia paisa moderna y atractiva",
  mx: "mexicano del centro de México, urbano de la Ciudad de México, estilo contemporáneo, fresco, seguro, conversacional y natural; cero caricatura o tono exagerado",
  es: "castellano peninsular de España, estilo urbano contemporáneo de Madrid, natural, claro, sofisticado y fluido; pronunciación limpia y moderna",
  cl: "chileno urbano de Santiago, estilo santiaguino contemporáneo, fresco, fluido, seguro y natural; articulación clara sin caricaturas",
};

export function accentHint(language, region) {
  if (language === "en") return "Speak American English. Keep this same voice on every line.";
  if (region === "plain") return "Habla en español con la voz natural de esta persona. No imites el acento de un país ni uses jerga regional.";
  const id = normalizeRegion(region);
  return `Habla en español con acento ${ACCENT[id]}. Conserva el timbre de la voz elegida y el texto literal. Tono moderno, adulto, inteligente, atractivo y fluido. Prohibido sonar campesino, bobo o infantil. No añadas modismos, no exageres ni caricaturices el acento.`;
}
