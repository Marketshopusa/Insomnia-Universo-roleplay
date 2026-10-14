export interface StudioPreset {
  id: string;
  category: "sfw" | "nsfw";
  title: string;
  badge: string;
  icon: string;
  camera: string;
  visualPrompt: string;
  suggestedLine: string;
}

export const STUDIO_PRESETS: StudioPreset[] = [
  // --- DRAMA & ROMANCE (SFW) ---
  {
    id: "sfw_close_up",
    category: "sfw",
    title: "Primer Plano Dramático",
    badge: "Mirada",
    icon: "🎬",
    camera: "Extreme close-up, 85mm portrait lens",
    visualPrompt: "cinematic raw footage, 85mm lens f/1.4, shallow depth of field. Extreme close-up of face with intense, magnetic eye contact. Soft cinematic rim lighting, gentle moisture on lower eyelashes, subtle parted lips with heavy emotional tension.",
    suggestedLine: "No tienes idea de cuánto tiempo he estado esperando que me dijeras eso…",
  },
  {
    id: "sfw_passionate_kiss",
    category: "sfw",
    title: "Beso Apasionado",
    badge: "Pasión",
    icon: "💋",
    camera: "Medium close-up, dynamic angle",
    visualPrompt: "cinematic 35mm film still, passionate kiss against a dark textured wall. Hands tangled in hair, bodies pressed close together in breathless anticipation. Warm moody ambient lighting, dramatic contrast and soft focus.",
    suggestedLine: "Bésame y no hablemos más de lo que pasó.",
  },
  {
    id: "sfw_rainy_car",
    category: "sfw",
    title: "Conversación en el Auto",
    badge: "Noche",
    icon: "🚗",
    camera: "Over-the-shoulder medium shot",
    visualPrompt: "cinematic night scene inside luxury car, neon reflections from rain streaking across side windows. Characters sitting close, looking at each other with unsaid words and palpable desire.",
    suggestedLine: "Si arrancas este auto ahora, no hay marcha atrás.",
  },
  {
    id: "sfw_bedroom_whisper",
    category: "sfw",
    title: "Vulnerabilidad en la Cama",
    badge: "Íntimo",
    icon: "🛏️",
    camera: "Low angle intimate side shot",
    visualPrompt: "soft warm golden hour bedroom light, two people lying on white silk sheets, facing each other closely. Gentle hand tracing the cheek, tender vulnerable expression, soft cinematic blur.",
    suggestedLine: "Quédate conmigo esta noche. Solo por hoy.",
  },
  {
    id: "sfw_doorway_tension",
    category: "sfw",
    title: "Tensión en la Puerta",
    badge: "Suspenso",
    icon: "🚪",
    camera: "Medium shot, corridor depth",
    visualPrompt: "cinematic hallway entrance, standing in open doorway with backlit moody lighting. Long lingering gaze, electric silence, hesitating before taking a step closer.",
    suggestedLine: "Sé que no debería haber venido a buscarte, pero no aguantaba más.",
  },
  {
    id: "sfw_lounge_flirt",
    category: "sfw",
    title: "Coqueteo en el Bar",
    badge: "Seducción",
    icon: "🍸",
    camera: "Medium close-up, amber bokeh",
    visualPrompt: "dimly lit upscale cocktail lounge, rich amber tones and bokeh background. Leaning forward over the counter, sultry confident smile, holding a glass while making undeniable eye contact.",
    suggestedLine: "¿Siempre eres tan peligroso cuando estás solo?",
  },

  // --- ADULTOS & EXPLICIT (NSFW) ---
  {
    id: "nsfw_cowgirl",
    category: "nsfw",
    title: "Cowgirl Dominante",
    badge: "Montando",
    icon: "👑",
    camera: "Low angle looking up, dynamic motion",
    visualPrompt: "candid raw ultra-realistic photo, cinematic moody lighting. Girl on top riding in cowgirl position, arched back, shiny sweaty skin, hair falling over shoulders, ecstatic facial expression with eyes closed in pleasure, dynamic hip movement.",
    suggestedLine: "*gime suavemente* Mira cómo me tienes… no te muevas, déjamelo todo a mí.",
  },
  {
    id: "nsfw_doggystyle",
    category: "nsfw",
    title: "Doggystyle Pasional",
    badge: "Desde Atrás",
    icon: "🍑",
    camera: "POV from behind, 45 degree dynamic angle",
    visualPrompt: "raw amateur photoreal shot, girl on all fours arched back in doggystyle position. High contrast bedroom lighting, shiny oily skin, looking back over shoulder with flushed cheeks and seductive breathless gaze.",
    suggestedLine: "*jadea entrecortado* Así… justo así, con más fuerza mi amor…",
  },
  {
    id: "nsfw_missionary",
    category: "nsfw",
    title: "Misionero Íntimo",
    badge: "Mirada Fija",
    icon: "🛏️",
    camera: "Top-down intimate close perspective",
    visualPrompt: "ultra realistic candid scene, girl lying on back with legs spread wide in deep missionary intimacy. Hands gripping the bedsheets, sweaty glowing skin, chest rising and falling heavily, looking straight into the camera with intense lust.",
    suggestedLine: "Mírame a los ojos mientras me tomas… quiero sentirte completo.",
  },
  {
    id: "nsfw_blowjob",
    category: "nsfw",
    title: "Oral Devoto",
    badge: "Oral",
    icon: "👄",
    camera: "POV looking down angle",
    visualPrompt: "candid photorealistic intimate shot, kneeling looking up through thick eyelashes, mouth open in seductive devotion. Glossy lips, flushed warm cheeks, soft dim ambient lighting.",
    suggestedLine: "*te mira fijamente* Dime si te gusta cómo te trato… no voy a parar.",
  },
  {
    id: "nsfw_piledriver",
    category: "nsfw",
    title: "Piledriver Intenso",
    badge: "Profundo",
    icon: "💥",
    camera: "Dramatic vertical angle",
    visualPrompt: "ultra realistic high-end adult shoot, piledriver position with legs held high and spread. Glistening skin with light sweat, ecstatic pleasure on face, heavy physical intensity and dramatic shadows.",
    suggestedLine: "*suelta un gemido fuerte* ¡Dios mío… qué rico…!",
  },
  {
    id: "nsfw_mating_press",
    category: "nsfw",
    title: "Mating Press Pasional",
    badge: "Aplastante",
    icon: "🔞",
    camera: "Over-the-shoulder intimate close-up",
    visualPrompt: "raw hyperrealistic shot, mating press position with legs pressed against chest, breathless flushed expression, slick sweaty skin, intense skin-on-skin intimacy under warm dim lamp lighting.",
    suggestedLine: "*te abraza con fuerza temblando* No pares… ya casi me vengo…",
  },
  {
    id: "nsfw_sixtynine",
    category: "nsfw",
    title: "69 Mutuo",
    badge: "69",
    icon: "🌀",
    camera: "Wide side intimate angle",
    visualPrompt: "candid sensual shot, 69 mutual position lying on side, intertwined bodies, smooth glowing skin, mutual passion and sensual focus under luxury soft bedding.",
    suggestedLine: "*acariciándote* Tómate tu tiempo… quiero que sintamos todo a la vez.",
  },
  {
    id: "nsfw_climax_finish",
    category: "nsfw",
    title: "Clímax / Acabada",
    badge: "Final",
    icon: "💦",
    camera: "Close-up facial portrait",
    visualPrompt: "candid realistic photo, breathless post-climax facial portrait. Head tilted back, eyes half-lidded in pure ecstasy, chest heaving with deep rapid breaths, skin glistening with sweat, completely overwhelmed by pleasure.",
    suggestedLine: "*suspira agotada con una sonrisa pícara* Estuvo increíble… ven aquí y abrázame.",
  },
  {
    id: "nsfw_shower_passion",
    category: "nsfw",
    title: "Pasión bajo la Ducha",
    badge: "Agua",
    icon: "🚿",
    camera: "Steamy medium shot through glass",
    visualPrompt: "steamy glass luxury shower, water droplets streaming down wet glistening skin and soaked hair. Body pressed against glass wall, passion and heated embrace under cascading warm water.",
    suggestedLine: "El agua está caliente, pero tú estás quemando…",
  },
];

export const PRESET_ARCS = {
  sfw_romance: [
    { title: "El Encuentro Inesperado", presetId: "sfw_doorway_tension" },
    { title: "La Confesión a Solas", presetId: "sfw_rainy_car" },
    { title: "El Beso Inevitable", presetId: "sfw_passionate_kiss" },
  ],
  nsfw_heat: [
    { title: "La Provocación", presetId: "nsfw_blowjob" },
    { title: "El Éxtasis Desatado", presetId: "nsfw_cowgirl" },
    { title: "El Clímax Total", presetId: "nsfw_mating_press" },
  ],
  nsfw_wild: [
    { title: "Entrega Inmediata", presetId: "nsfw_doggystyle" },
    { title: "Intensidad Piledriver", presetId: "nsfw_piledriver" },
    { title: "Acabada Monumental", presetId: "nsfw_climax_finish" },
  ],
};
