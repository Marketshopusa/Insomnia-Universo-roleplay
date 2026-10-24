/**
 * Foley Studio - Curated Cinematic Sound Effects Engine
 * Generates and plays high-fidelity, zero-latency, $0 cost physical sound effects
 * (doors locking, slaps/flesh impact, bed creaks, footsteps, sheets, zippers, heartbeats)
 * synchronized with roleplay actions and stage directions.
 */

export type FoleyType =
  | "flesh_impact"
  | "slap"
  | "door_lock"
  | "door_close"
  | "door_slam"
  | "zipper"
  | "sheets_rustle"
  | "bed_creak"
  | "footsteps"
  | "heartbeat"
  | "pour_drink";

export interface FoleyEvent {
  type: FoleyType;
  match: string;
  delaySec: number;
}

const FOLEY_PATTERNS: Array<[FoleyType, RegExp]> = [
  ["flesh_impact", /(?:golpe\w*\s+(?:mi|tu|su)?\s*(?:trasero|culo|piel|nalgas?|cuerpo)|mano\s+golpea\w*|mano\s+(?:en|contra)\s+(?:mi|tu|su)?\s*(?:trasero|culo|nalgas?)|nalgada\w*|palmada\w*|azot\w*\s+(?:mi|tu|su)?\s*(?:trasero|culo|piel|nalgas?)|choque\s+de\s+(?:nuestros\s+)?cuerpos|piel\s+contra\s+piel|embestid\w*|chocan\s+nuestras\s+caderas|cuerpos\s+uni[eé]ndose|roce\s+de\s+(?:nuestros\s+)?cuerpos|manos?\s+(?:sobre|recorre\w*)\s+(?:el\s+)?(?:pecho|muslo|cuerpo|espalda|piel)|fricci[oó]n\s+entre\s+(?:nuestras\s+pieles|ambos|los\s+dos))/iu],
  ["slap", /(?:bofetada\w*|cachetada\w*|le\s+cruza\s+la\s+cara|sonora\s+palmada\s+en\s+la\s+mejilla)/iu],
  ["door_lock", /(?:cierra\s+(?:la\s+puerta\s+)?con\s+seguro|pone\s+el\s+seguro|echa\s+el\s+cerrojo|pasa\s+el\s+cerrojo|gira\s+la\s+llave|cerrar\s+con\s+llave|seguro\s+a\s+la\s+puerta|asegura\s+la\s+puerta)/iu],
  ["door_slam", /(?:portazo|cierra\s+de\s+golpe|azota\s+la\s+puerta)/iu],
  ["door_close", /(?:cierra\s+la\s+puerta|empuja\s+la\s+puerta|cerrando\s+la\s+puerta|puerta\s+se\s+cierra)/iu],
  ["zipper", /(?:cremallera|baja\s+el\s+cierre|bajar\s+la\s+cremallera|desabrocha\s+el\s+pantal[oó]n|sonido\s+met[aá]lico\s+del\s+cierre|sube\s+el\s+cierre)/iu],
  ["bed_creak", /(?:cama\s+rechina|colch[oó]n\s+cruje|muelles\s+de\s+la\s+cama|crujido\s+de\s+la\s+madera|el\s+colch[oó]n\s+cede)/iu],
  ["sheets_rustle", /(?:s[aá]banas|entre\s+las\s+s[aá]banas|roce\s+de\s+(?:las?\s+)?(?:s[aá]banas|ropa|toalla)|desliza\s+(?:en\s+la\s+cama|la\s+toalla)|arropa|cae\s+(?:al\s+suelo\s+)?(?:la\s+ropa|la\s+toalla)|deja\s+caer\s+la\s+toalla|se\s+desviste|desnud)/iu],
  ["footsteps", /(?:pasos\s+(?:lentos|pesados|apurados)|camina\s+hacia|se\s+acerca\s+lentamente|tacones\s+reson)/iu],
  ["heartbeat", /(?:coraz[oó]n\s+(?:latiendo|se\s+acelera|se\s+dispara|a\s+mil)|latidos\s+(?:acelerados|fuertes)|palpitaciones|pecho\s+(?:sube\s+y\s+baja|agitado|acelerado)|respiraci[oó]n\s+(?:agitada|acelerada))/iu],
  ["pour_drink", /(?:sirve\s+(?:una\s+copa|vino|el\s+trago)|descorcha|brindan|chocan\s+las\s+copas)/iu],
];

/**
 * Detects foley events within text, prioritizing actions in stage directions (*...*).
 */
export function detectFoleyEvents(text: string): FoleyEvent[] {
  if (!text) return [];
  const events: FoleyEvent[] = [];
  const stages = text.match(/\*[^*]+\*/g);
  const segments = stages && stages.length ? stages : [text];

  for (let i = 0; i < segments.length; i++) {
    const stage = segments[i];
    for (const [type, pattern] of FOLEY_PATTERNS) {
      const match = pattern.exec(stage);
      if (match) {
        if (!events.some((e) => e.type === type)) {
          events.push({
            type,
            match: match[0],
            delaySec: i === 0 ? 0.05 : i * 0.4,
          });
        }
      }
    }
  }

  // Also scan full text for any un-bracketed action matches
  for (const [type, pattern] of FOLEY_PATTERNS) {
    if (!events.some((e) => e.type === type)) {
      const match = pattern.exec(text);
      if (match) {
        events.push({
          type,
          match: match[0],
          delaySec: 0.05,
        });
      }
    }
  }

  return events;
}

const foleyCache = new Map<string, Float32Array>();

/**
 * Procedural acoustic synthesizer for cinematic Foley effects.
 * Produces clean 24kHz / 32-bit float audio waveforms.
 */
export function generateFoleyPcm(type: FoleyType, sampleRate = 24000): Float32Array {
  const cacheKey = `${type}_${sampleRate}`;
  if (foleyCache.has(cacheKey)) return foleyCache.get(cacheKey)!;

  let buffer: Float32Array;

  switch (type) {
    case "flesh_impact": {
      // Impacto visceral y sordo de cuerpo/flesh: subgrave estable (54Hz) + cuerpo sordo orgánico sin chirridos
      const duration = 0.28;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      let filter1 = 0;
      let filter2 = 0;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const sub = Math.sin(2 * Math.PI * 54 * t) * Math.exp(-t * 20) * 0.9;
        const body = Math.sin(2 * Math.PI * 110 * t) * Math.exp(-t * 24) * 0.45;
        const rawNoise = (Math.random() * 2 - 1) * Math.exp(-t * 55);
        filter1 = filter1 * 0.8 + rawNoise * 0.2;
        filter2 = filter2 * 0.75 + filter1 * 0.25;
        buffer[i] = Math.tanh((sub + body + filter2 * 0.35) * 1.2) * 0.85;
      }
      break;
    }

    case "slap": {
      // Bofetada sorda y seca: golpe físico de piel con calidez acústica
      const duration = 0.22;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      let noiseFilter = 0;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const sub = Math.sin(2 * Math.PI * 80 * t) * Math.exp(-t * 26) * 0.75;
        const raw = (Math.random() * 2 - 1) * Math.exp(-t * 45);
        noiseFilter = noiseFilter * 0.75 + raw * 0.25;
        buffer[i] = Math.tanh((sub + noiseFilter * 0.4) * 1.2) * 0.85;
      }
      break;
    }

    case "door_lock": {
      // Deadbolt turning: First slide (t=0..0.06s), then solid metallic bolt clack (t=0.12s)
      const duration = 0.32;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        let s = 0;
        // Slide friction
        if (t < 0.08) {
          s += (Math.random() * 2 - 1) * Math.sin(2 * Math.PI * 2800 * t) * Math.exp(-t * 18) * 0.35;
        }
        // Heavy metallic latch engagement
        if (t >= 0.10) {
          const t2 = t - 0.10;
          const bolt = Math.sin(2 * Math.PI * (260 * Math.exp(-t2 * 30) + 85) * t2) * Math.exp(-t2 * 28) * 0.75;
          const ping = Math.sin(2 * Math.PI * 3400 * t2) * Math.exp(-t2 * 60) * 0.4;
          s += bolt + ping;
        }
        buffer[i] = Math.max(-1, Math.min(1, s));
      }
      break;
    }

    case "door_close": {
      // Solid wooden door closing: Wood resonance (85Hz) + latch click
      const duration = 0.38;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const thud = Math.sin(2 * Math.PI * (110 * Math.exp(-t * 22) + 55) * t) * Math.exp(-t * 14) * 0.8;
        const latch = t < 0.04 ? Math.sin(2 * Math.PI * 2100 * t) * Math.exp(-t * 80) * 0.4 : 0;
        buffer[i] = Math.max(-1, Math.min(1, thud + latch));
      }
      break;
    }

    case "door_slam": {
      // Heavy reverberant door slam: Deep sub impact (50Hz) + shockwave
      const duration = 0.65;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const sub = Math.sin(2 * Math.PI * (90 * Math.exp(-t * 15) + 42) * t) * Math.exp(-t * 8) * 0.9;
        const crash = (Math.random() * 2 - 1) * Math.exp(-t * 25) * 0.55;
        buffer[i] = Math.max(-1, Math.min(1, sub + crash));
      }
      break;
    }

    case "zipper": {
      // Roce suave y deslizamiento textil sordo sin chirridos ni pitidos
      const duration = 0.35;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      let lp = 0;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const rawNoise = (Math.random() * 2 - 1) * Math.sin(Math.PI * (t / duration));
        lp = lp * 0.85 + rawNoise * 0.15;
        buffer[i] = lp * 0.45;
      }
      break;
    }

    case "bed_creak": {
      // Bedspring / wood joint creak: Multi-harmonic wood friction + mechanical spring tension
      const duration = 0.55;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const vib = 12 * Math.sin(2 * Math.PI * 7.5 * t);
        const wood = Math.sin(2 * Math.PI * (165 + vib) * t) * 0.45;
        const spring1 = Math.sin(2 * Math.PI * (285 + vib * 1.2) * t) * 0.35;
        const spring2 = Math.sin(2 * Math.PI * (420 + vib * 1.5) * t) * 0.2;
        const friction = ((Math.random() * 2 - 1) * 0.15) * Math.sin(2 * Math.PI * 18 * t);
        const env = Math.sin(Math.PI * (t / duration)) * Math.exp(-t * 2.8);
        buffer[i] = Math.max(-1, Math.min(1, (wood + spring1 + spring2 + friction) * env * 0.85));
      }
      break;
    }

    case "sheets_rustle": {
      // Soft cotton sheets moving: Dual-layer smooth noise swell without harsh treble
      const duration = 0.85;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      let lp1 = 0;
      let lp2 = 0;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const rawNoise = Math.random() * 2 - 1;
        lp1 = lp1 * 0.82 + rawNoise * 0.18;
        lp2 = lp2 * 0.75 + lp1 * 0.25;
        const env = Math.sin(Math.PI * (t / duration)) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 3.2 * t));
        buffer[i] = lp2 * env * 0.75;
      }
      break;
    }

    case "footsteps": {
      // 2 approaching footsteps on wood/carpet floor: Deep heel thud + soft sole touch
      const duration = 0.90;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      const stepTimes = [0.06, 0.48];
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        let s = 0;
        for (let stepIdx = 0; stepIdx < stepTimes.length; stepIdx++) {
          const st = t - stepTimes[stepIdx];
          if (st >= 0 && st < 0.22) {
            const heel = Math.sin(2 * Math.PI * (95 * Math.exp(-st * 24) + 48) * st) * Math.exp(-st * 20) * (0.8 + stepIdx * 0.25);
            const sole = (Math.random() * 2 - 1) * Math.exp(-st * 38) * 0.18;
            s += heel + sole;
          }
        }
        buffer[i] = Math.max(-1, Math.min(1, s));
      }
      break;
    }

    case "heartbeat": {
      // Cardiac double thud (Lub-Dub)
      const duration = 0.70;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        let s = 0;
        // Lub
        if (t >= 0.05 && t < 0.22) {
          const t1 = t - 0.05;
          s += Math.sin(2 * Math.PI * (65 * Math.exp(-t1 * 10) + 45) * t1) * Math.sin(Math.PI * (t1 / 0.17)) * 0.8;
        }
        // Dub
        if (t >= 0.28 && t < 0.48) {
          const t2 = t - 0.28;
          s += Math.sin(2 * Math.PI * (78 * Math.exp(-t2 * 12) + 50) * t2) * Math.sin(Math.PI * (t2 / 0.20)) * 0.95;
        }
        buffer[i] = Math.max(-1, Math.min(1, s));
      }
      break;
    }

    case "pour_drink": {
      // Drink pouring + glass touch
      const duration = 0.85;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const gurgle = Math.sin(2 * Math.PI * (420 + Math.sin(t * 35) * 120) * t) * Math.exp(-t * 2.5) * 0.35;
        const splash = (Math.random() * 2 - 1) * Math.exp(-t * 3.5) * 0.2;
        const clink = t > 0.55 ? Math.sin(2 * Math.PI * 3200 * (t - 0.55)) * Math.exp(-(t - 0.55) * 22) * 0.4 : 0;
        buffer[i] = Math.max(-1, Math.min(1, gurgle + splash + clink));
      }
      break;
    }

    default:
      buffer = new Float32Array(sampleRate * 0.1);
  }

  foleyCache.set(cacheKey, buffer);
  return buffer;
}

/**
 * Plays a Foley sound effect into an AudioContext at a scheduled time.
 */
export function playFoley(
  context: AudioContext,
  type: FoleyType,
  startTime?: number,
  volume = 0.65
): AudioBufferSourceNode | null {
  try {
    const pcm = generateFoleyPcm(type, context.sampleRate || 24000);
    const audioBuffer = context.createBuffer(1, pcm.length, context.sampleRate || 24000);
    audioBuffer.copyToChannel(pcm, 0);

    const source = context.createBufferSource();
    source.buffer = audioBuffer;

    const gainNode = context.createGain();
    gainNode.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), context.currentTime);

    // Warm cinematic acoustic lowpass filter (removes digital harshness)
    if (typeof context.createBiquadFilter === "function") {
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(type === "flesh_impact" ? 1800 : type === "slap" ? 4200 : 3200, context.currentTime);
      filter.Q.setValueAtTime(0.7, context.currentTime);
      source.connect(filter);
      filter.connect(gainNode);
    } else {
      source.connect(gainNode);
    }
    gainNode.connect(context.destination);

    const when = Math.max(context.currentTime, startTime ?? context.currentTime);
    source.start(when);
    return source;
  } catch (err) {
    console.warn("Foley Studio playback failed:", err);
    return null;
  }
}

/**
 * Automatically schedules all detected Foley events in a message synchronized with speech.
 */
import { scheduleCinematicScene } from "./soundbank";

/**
 * Automatically schedules all detected Foley and Cinematic Soundbank events in a message synchronized with speech.
 */
export function scheduleFoleyForMessage(
  context: AudioContext,
  messageText: string,
  baseTime?: number,
  volume = 0.60
): AudioBufferSourceNode[] {
  // 1. Orquestación cinemática de alta fidelidad desde la Galería de Sonidos (28 categorías)
  const cinematicSources = scheduleCinematicScene(context, messageText, baseTime, volume);
  if (cinematicSources.length > 0) {
    return cinematicSources;
  }

  // 2. Fallback procedural si el texto no fue capturado por el soundbank
  const events = detectFoleyEvents(messageText);
  if (!events.length) return [];

  const start = baseTime ?? context.currentTime;
  const sources: AudioBufferSourceNode[] = [];

  for (const event of events) {
    const source = playFoley(context, event.type, start + event.delaySec, volume);
    if (source) sources.push(source);
  }

  return sources;
}

let globalFoleyCtx: AudioContext | null = null;

/**
 * Reproduce inmediatamente todos los efectos de la escena (truenos, lluvia, pasos, impactos, foley, etc.)
 * en el navegador de forma 100% autónoma, sin depender de TTS ni de latencia de red.
 */
export function playSceneFoley(messageText: string, volume = 0.65): AudioBufferSourceNode[] {
  if (typeof window === "undefined" || !messageText) return [];
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return [];
    if (!globalFoleyCtx || globalFoleyCtx.state === "closed") {
      globalFoleyCtx = new AudioCtx();
    }
    if (globalFoleyCtx.state === "suspended") {
      void globalFoleyCtx.resume();
    }
    return scheduleFoleyForMessage(globalFoleyCtx, messageText, globalFoleyCtx.currentTime + 0.04, volume);
  } catch (err) {
    console.warn("playSceneFoley error:", err);
    return [];
  }
}

