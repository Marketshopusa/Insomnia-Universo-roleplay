import type { DetectedSoundEvent, SoundId } from "./types";

/**
 * Catálogo de patrones de reconocimiento semántico para cada sonido de la galería.
 * Cada regla está diseñada quirúrgicamente para coincidir con la acción real y evitar falsos positivos.
 */
const SOUND_PATTERNS: Array<[SoundId, RegExp]> = [
  // 1. IMPACTOS FÍSICOS Y CUERPO
  [
    "wall_slam",
    /(?:contra\s+la\s+pared|pega\w*\s+contra\s+la\s+pared|empuja\w*\s+contra\s+la\s+pared|golpea\w*\s+(?:sus\s+manos\s+)?contra\s+la\s+pared|espalda\s+choca\s+contra\s+la\s+pared|impact(?:o|a)\s+contra\s+el\s+muro|contra\s+la\s+puerta\s+cerrada|contra\s+el\s+respaldar)/iu,
  ],
  [
    "flesh_impact",
    /(?:choque\s+de\s+(?:nuestros\s+)?cuerpos|piel\s+contra\s+piel|nalgada\w*|palmada\w*\s+(?:en|sobre)\s+(?:mi|tu|su)?\s*(?:trasero|culo|nalgas?|piel)|golpe\w*\s+(?:mi|tu|su)?\s*(?:trasero|culo|piel|nalgas?)|azot\w*\s+(?:mi|tu|su)?\s*(?:trasero|culo|piel)|chocan\s+nuestras\s+caderas|embestid\w*|fricci[oó]n\s+entre\s+nuestras\s+pieles|manos?\s+recorre\w*\s+(?:con\s+fuerza\s+)?(?:el\s+)?(?:cuerpo|espalda|muslos)|sintiendo\s+cada\s+golpe|cada\s+golpe|golpeteo|fuerza\s+y\s+profundidad|cuerpo\s+a\s+cuerpo|al\s+entrar|penetr\w*|empuj\w*\s+adentro)/iu,
  ],
  [
    "slap",
    /(?:bofetada\w*|cachetada\w*|le\s+cruza\s+la\s+cara|sonora\s+palmada\s+en\s+la\s+mejilla|golpe\s+en\s+el\s+rostro)/iu,
  ],
  [
    "bed_creak",
    /(?:cama\s+rechina|colch[oó]n\s+cruje|muelles\s+de\s+la\s+cama|crujido\s+de\s+la\s+madera|el\s+colch[oó]n\s+cede|rechinido\s+del\s+somier|cabecero\s+golpea)/iu,
  ],
  [
    "fabric_sheets",
    /(?:s[aá]banas|entre\s+las\s+s[aá]banas|roce\s+de\s+(?:las?\s+)?(?:s[aá]banas|ropa|toalla)|desliza\s+(?:en\s+la\s+cama|la\s+toalla)|arropa|cae\s+(?:al\s+suelo\s+)?(?:la\s+ropa|la\s+toalla)|deja\s+caer\s+la\s+toalla|se\s+desviste|desnud(?:a|arse|ando))/iu,
  ],
  [
    "zipper",
    /(?:cremallera|baja\s+el\s+cierre|bajar\s+la\s+cremallera|desabrocha\s+el\s+pantal[oó]n|sonido\s+met[aá]lico\s+del\s+cierre|sube\s+el\s+cierre)/iu,
  ],

  // 2. ACCIONES COTIDIANAS Y ENTORNO
  [
    "footsteps_heels",
    /(?:tacones\s+reson|taconeo|el\s+sonar\s+de\s+sus\s+tacones|pasos\s+de\s+tac[oó]n)/iu,
  ],
  [
    "footsteps_running",
    /(?:corre\w*\s+(?:hacia|por|desesperad)|pasos\s+(?:r[aá]pidos|apurados|acelerados)|ech(?:o|a|ó)\s+a\s+correr|corriendo\s+hacia)/iu,
  ],
  [
    "footsteps_normal",
    /(?:pasos\s+(?:lentos|pesados|cautos|firmes)|camina\s+hacia|se\s+acerca\s+lentamente|se\s+aproxima\s+a\s+paso)/iu,
  ],
  [
    "door_slam",
    /(?:portazo|cierra\s+de\s+golpe|azota\s+la\s+puerta|golpe\s+de\s+la\s+puerta)/iu,
  ],
  [
    "door_lock",
    /(?:cierra\s+(?:la\s+puerta\s+)?con\s+seguro|pone\s+el\s+seguro|echa\s+el\s+cerrojo|pasa\s+el\s+cerrojo|gira\s+la\s+llave|cerrar\s+con\s+llave|seguro\s+a\s+la\s+puerta|asegura\s+la\s+puerta)/iu,
  ],
  [
    "door_open_close",
    /(?:cierra\s+la\s+puerta|empuja\s+la\s+puerta|abre\s+la\s+puerta|cerrando\s+la\s+puerta|puerta\s+se\s+cierra|puerta\s+se\s+abre)/iu,
  ],
  [
    "glasses_clink",
    /(?:chocan\s+las\s+copas|brindis|brindan|tintineo\s+de\s+(?:las\s+)?copas|chocar\s+los\s+vasos|cristal\s+tintineando)/iu,
  ],
  [
    "pour_liquid",
    /(?:sirve\s+(?:una\s+copa|vino|el\s+trago|champ[aá]n)|descorcha|líquido\s+cayendo\s+en\s+la\s+copa|descorchar\s+la\s+botella)/iu,
  ],
  [
    "applause",
    /(?:aplausos?|aplauden|ovaci[oó]n|palmas\s+del\s+p[uú]blico|la\s+sala\s+aplaude)/iu,
  ],

  // 3. PAISAJE SONORO Y MÚSICA AMBIENTAL
  [
    "thunder_storm",
    /(?:truenos?|retumb\w*\s+un\s+trueno|rel[aá]mpago|tormenta\s+retumba|estruendo\s+en\s+el\s+cielo)/iu,
  ],
  [
    "rain_window",
    /(?:sonidos?\s+de\s+la\s+lluvia|lluvia\s+(?:golpea|cae|afuera|torrencial)|gotas\s+en\s+la\s+ventana|bajo\s+la\s+lluvia|escucha\s+la\s+lluvia)/iu,
  ],
  [
    "wind_night",
    /(?:viento\s+nocturno|sopla\s+el\s+viento|silbido\s+del\s+viento|brisa\s+fr[ií]a)/iu,
  ],
  [
    "salon_music",
    /(?:m[uú]sica\s+(?:del\s+sal[oó]n|de\s+fondo|suave|lenta|íntima|intima)|piano\s+(?:suave|melanc[oó]lico)|melod[ií]a\s+de\s+fondo|suena\s+una\s+m[uú]sica)/iu,
  ],

  // 4. EXPRESIONES VOCALES Y PASIÓN
  [
    "gasp_breathless",
    /(?:sac[aá]ndole\s+(?:un\s+poco\s+)?la\s+respiraci[oó]n|falta\s+de\s+aire|sin\s+aliento|respiraci[oó]n\s+(?:entrecortada|ahogada)|boquea\s+sin\s+aire|jadeo\s+ahogado|ahogando\s+el\s+aire)/iu,
  ],
  [
    "pant_running",
    /(?:respiraci[oó]n\s+(?:agitada|acelerada)|jadeando\s+con\s+fuerza|pecho\s+(?:sube\s+y\s+baja|agitado)|aliento\s+pesado|agitaci[oó]n\s+intensa)/iu,
  ],
  [
    "moan_pleasure",
    /(?:gemi(?:do|endo|ó|eron|es)?\s+(?:de\s+placer|sensual|ahogado|profundo|incontrolable)|gemid(?:o|os)\s+que\s+escapa|suelta\s+un\s+(?:pequeño\s+)?gemido|se\s+le\s+escapa\s+un\s+gemido|gime\s+de\s+placer|delicioso\s+gemido)/iu,
  ],
  [
    "moan_subtle",
    /(?:gemidito|leve\s+gemido|gemido\s+suave|gime\s+bajito|pequeño\s+gemido|gemido\s+contenido)/iu,
  ],
  [
    "scream_pleasure",
    /(?:grito\s+de\s+placer|grita\s+de\s+placer|chillido\s+de\s+placer|gemido\s+se\s+convierte\s+en\s+grito|grita\s+su\s+nombre\s+al\s+llegar\s+al\s+cl[ií]max)/iu,
  ],
  [
    "scream_pain",
    /(?:grito\s+de\s+dolor|alarido\s+desgarrador|chillido\s+de\s+miedo|grito\s+ahogado\s+de\s+dolor)/iu,
  ],
  [
    "cry_deep",
    /(?:llanto\s+profundo|sollozos?\s+desgarrador|rompe\s+a\s+llorar|llora\s+desconsoladamente|l[aá]grimas\s+con\s+sollozos|hipidos?\s+de\s+llanto)/iu,
  ],
  [
    "guttural_groan",
    /(?:sonido\s+gutural|gruñido\s+ronco|quejido\s+bajo|gruñe\s+entre\s+dientes|ronco\s+gemido\s+gutural)/iu,
  ],
  [
    "kiss_wet",
    /(?:beso\s+(?:h[uú]medo|apasionado|profundo|voraz)|chasquido\s+de\s+labios|labios\s+chocando|lenguas\s+entrelaz[aá]ndose)/iu,
  ],
  [
    "laugh_burst",
    /(?:carcajadas?|estalla\s+en\s+risas?|risotada|riendo\s+a\s+carcajadas)/iu,
  ],
  [
    "laugh_chuckle",
    /(?:risita\s+(?:p[ií]cara|burlona|c[oó]mplice|baja)|suelta\s+una\s+risita|se\s+r[ií]e\s+por\s+lo\s+bajo)/iu,
  ],
];

/**
 * Escanea el texto y detecta con precisión milimétrica los eventos sonoros pertinentes.
 * Prioriza acotaciones físicas y de ambientación (*...*).
 * NUNCA inventa sonidos aleatorios si el texto no contiene la acción.
 */
export function detectSoundEvents(text: string): DetectedSoundEvent[] {
  if (!text) return [];
  const events: DetectedSoundEvent[] = [];
  const registered = new Set<SoundId>();

  // 1. Extraer segmentos de acotaciones escénicas (*...*) y analizarlos con prioridad
  const stages = text.match(/\*[^*]+\*/g) || [];
  const segments = stages.length ? stages : [text];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    for (const [soundId, pattern] of SOUND_PATTERNS) {
      if (registered.has(soundId)) continue;
      const match = pattern.exec(segment);
      if (match) {
        registered.add(soundId);
        events.push({
          soundId,
          matchedText: match[0],
          // Escalonar los efectos en la línea de tiempo de forma armónica
          delaySec: i === 0 ? 0.04 : Math.min(i * 0.35, 1.8),
          volume: soundId.startsWith("rain") || soundId.startsWith("salon") ? 0.35 : 0.65,
        });
      }
    }
  }

  // 2. Si hay texto narrativo fuera de asteriscos, escanear patrones que no hayan sido capturados
  for (const [soundId, pattern] of SOUND_PATTERNS) {
    if (registered.has(soundId)) continue;
    const match = pattern.exec(text);
    if (match) {
      registered.add(soundId);
      events.push({
        soundId,
        matchedText: match[0],
        delaySec: 0.05,
        volume: soundId.startsWith("rain") || soundId.startsWith("salon") ? 0.35 : 0.65,
      });
    }
  }

  return events;
}
