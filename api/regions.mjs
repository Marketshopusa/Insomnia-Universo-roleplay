/** Shared accent + slang. México is the default. Spain uses es-ES. */
export const REGIONS = {
  ar: { label: "Argentina", locale: "es-AR", slang: "Escribe con jerga de Argentina: vos, tenés, che y dale." },
  ve: { label: "Venezuela", locale: "es-VE", slang: "Escribe con jerga de Venezuela: chamo y vale." },
  co: { label: "Colombia", locale: "es-CO", slang: "Escribe con jerga de Colombia: parce, bacano y qué más." },
  mx: { label: "México", locale: "es-MX", slang: "Escribe con jerga de México: órale, ahorita y chido." },
  es: { label: "España", locale: "es-ES", slang: "Escribe con jerga de España: vale, tío y mola." },
  cl: { label: "Chile", locale: "es-CL", slang: "Escribe con jerga de Chile: po, cachai y al tiro." },
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
  ar: "rioplatense urbano de Buenos Aires, con entonación porteña suave",
  ve: "venezolano urbano de Caracas, con cadencia caraqueña natural",
  co: "colombiano de Bogotá, con articulación bogotana cálida y natural",
  mx: "mexicano del centro de México, con cadencia conversacional natural",
  es: "castellano peninsular de España, con pronunciación natural",
  cl: "chileno urbano de Santiago, con cadencia santiaguina clara y natural",
};

export function accentHint(language, region) {
  if (language === "en") return "Speak American English. Keep this same voice on every line.";
  if (region === "plain") return "Habla en español con la voz natural de esta persona. No imites el acento de un país ni uses jerga regional.";
  const id = normalizeRegion(region);
  return `Habla en español con acento ${ACCENT[id]}. Conserva el timbre de la voz elegida y el texto literal. No añadas modismos, no exageres ni caricaturices el acento.`;
}
