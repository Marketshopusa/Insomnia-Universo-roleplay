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
  if (language === "en" || !region || region === "plain") return "";
  const selected = REGIONS[normalizeRegion(region)];
  return `REGISTRO REGIONAL DEL PERSONAJE: español de ${selected.label}. Mantén esta variedad durante toda la conversación, con vocabulario y cadencia naturales. Usa modismos con moderación cuando encajen; no repitas muletillas en cada turno ni cambies la personalidad, identidad o nivel de cercanía para imitar el acento.`;
}

const ACCENT = {
  ar: "rioplatense urbano de Buenos Aires, con entonación y pronunciación porteñas naturales",
  ve: "venezolano urbano de Caracas, con cadencia caraqueña y pronunciación venezolana reconocibles",
  co: "colombiano de Medellín, con cadencia paisa natural",
  mx: "mexicano del centro de México, con cadencia y pronunciación de la Ciudad de México",
  es: "castellano peninsular de España, con pronunciación y entonación madrileñas",
  cl: "chileno urbano de Santiago, con cadencia y pronunciación santiaguinas naturales",
};

export function accentHint(language, region) {
  if (language === "en") return "Speak American English. Keep this same voice on every line.";
  if (region === "plain") return "Habla en español con la voz natural de esta persona. No imites el acento de un país ni uses jerga regional.";
  const id = normalizeRegion(region);
  return `La región seleccionada es ${REGIONS[id].label}. Habla en español con acento ${ACCENT[id]}. Conserva el timbre, registro y tesitura de la voz elegida y el texto literal. El acento no cambia su identidad ni su emoción: adapta la emoción al texto manteniendo la misma persona. No añadas modismos, no exageres ni caricaturices el acento.`;
}
