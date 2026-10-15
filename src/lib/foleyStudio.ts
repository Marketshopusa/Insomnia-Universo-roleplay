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
  ["flesh_impact", /(?:nalgada|palmada\s+en|choque\s+de\s+(?:nuestros\s+)?cuerpos|piel\s+contra\s+piel|azot(?:a|ó|e|ando)\s+(?:mi|tu|su)\s+(?:trasero|culo|piel)|embestid(?:a|as)|chocan\s+nuestras\s+caderas|cuerpos\s+uni[eé]ndose)/iu],
  ["slap", /(?:bofetada|cachetada|le\s+cruza\s+la\s+cara|sonora\s+palmada\s+en\s+la\s+mejilla)/iu],
  ["door_lock", /(?:cierra\s+(?:la\s+puerta\s+)?con\s+seguro|pone\s+el\s+seguro|echa\s+el\s+cerrojo|pasa\s+el\s+cerrojo|gira\s+la\s+llave|cerrar\s+con\s+llave|seguro\s+a\s+la\s+puerta|asegura\s+la\s+puerta)/iu],
  ["door_slam", /(?:portazo|cierra\s+de\s+golpe|azota\s+la\s+puerta)/iu],
  ["door_close", /(?:cierra\s+la\s+puerta|empuja\s+la\s+puerta|cerrando\s+la\s+puerta|puerta\s+se\s+cierra)/iu],
  ["zipper", /(?:cremallera|baja\s+el\s+cierre|bajar\s+la\s+cremallera|desabrocha\s+el\s+pantal[oó]n|sonido\s+met[aá]lico\s+del\s+cierre|sube\s+el\s+cierre)/iu],
  ["bed_creak", /(?:cama\s+rechina|colch[oó]n\s+cruje|muelles\s+de\s+la\s+cama|crujido\s+de\s+la\s+madera|el\s+colch[oó]n\s+cede)/iu],
  ["sheets_rustle", /(?:s[aá]banas|entre\s+las\s+s[aá]banas|roce\s+de\s+(?:las?\s+)?(?:s[aá]banas|ropa)|desliza\s+en\s+la\s+cama|arropa|cae\s+al\s+suelo\s+la\s+ropa|se\s+desviste)/iu],
  ["footsteps", /(?:pasos\s+(?:lentos|pesados|apurados)|camina\s+hacia|se\s+acerca\s+lentamente|tacones\s+reson)/iu],
  ["heartbeat", /(?:coraz[oó]n\s+latiendo|latidos\s+(?:acelerados|fuertes)|palpitaciones|pecho\s+sube\s+y\s+baja)/iu],
  ["pour_drink", /(?:sirve\s+(?:una\s+copa|vino|el\s+trago)|descorcha|brindan|chocan\s+las\s+copas)/iu],
];

/**
 * Detects foley events within text, prioritizing actions in stage directions (*...*).
 */
export function detectFoleyEvents(text: string): FoleyEvent[] {
  if (!text) return [];
  const events: FoleyEvent[] = [];
  const stages = text.match(/\*[^*]+\*/g) || [text];

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    for (const [type, pattern] of FOLEY_PATTERNS) {
      const match = pattern.exec(stage);
      if (match) {
        // Prevent duplicate types in the same message
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
      // Physical flesh/body slap: Low thud (150Hz -> 50Hz) + sharp skin transient
      const duration = 0.18;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const bodyFreq = 150 * Math.exp(-t * 26) + 48;
        const body = Math.sin(2 * Math.PI * bodyFreq * t) * Math.exp(-t * 24) * 0.8;
        const noise = (Math.random() * 2 - 1) * Math.exp(-t * 55) * 0.7;
        const pop = t < 0.008 ? Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 200) * 0.5 : 0;
        buffer[i] = Math.max(-1, Math.min(1, body + noise + pop));
      }
      break;
    }

    case "slap": {
      // Sharp stinging facial slap: Stinging high-frequency burst + swift decay
      const duration = 0.12;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const transient = Math.sin(2 * Math.PI * 2400 * t) * Math.exp(-t * 70) * 0.8;
        const noise = (Math.random() * 2 - 1) * Math.exp(-t * 45) * 0.6;
        const low = Math.sin(2 * Math.PI * 110 * t) * Math.exp(-t * 30) * 0.4;
        buffer[i] = Math.max(-1, Math.min(1, transient + noise + low));
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
      // Metal/nylon zipper sliding: Quick succession of 16 interlocking tooth clicks
      const duration = 0.42;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      const clickInterval = 0.018;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const clickIndex = Math.floor(t / clickInterval);
        const tInClick = t - clickIndex * clickInterval;
        if (clickIndex < 20 && tInClick < 0.008) {
          const freq = 1800 + clickIndex * 40;
          buffer[i] = Math.sin(2 * Math.PI * freq * tInClick) * Math.exp(-tInClick * 350) * 0.6;
        } else {
          buffer[i] = (Math.random() * 2 - 1) * 0.03 * (1 - t / duration);
        }
      }
      break;
    }

    case "bed_creak": {
      // Bedspring / wood joint creak under weight: Dual modulated frequencies
      const duration = 0.48;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const vib = 15 * Math.sin(2 * Math.PI * 9 * t);
        const spring1 = Math.sin(2 * Math.PI * (340 + vib) * t);
        const spring2 = Math.sin(2 * Math.PI * (510 + vib * 1.4) * t) * 0.5;
        const env = Math.sin(Math.PI * (t / duration)) * Math.exp(-t * 3.5);
        buffer[i] = Math.max(-1, Math.min(1, (spring1 + spring2) * env * 0.7));
      }
      break;
    }

    case "sheets_rustle": {
      // Soft cotton sheets moving: Filtered noise swell
      const duration = 0.75;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      let filterState = 0;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const rawNoise = Math.random() * 2 - 1;
        // Simple lowpass smoothing
        filterState = filterState * 0.85 + rawNoise * 0.15;
        const env = Math.sin(Math.PI * (t / duration)) * Math.sin(2 * Math.PI * 4 * t) * 0.5 + 0.5;
        buffer[i] = filterState * env * 0.6;
      }
      break;
    }

    case "footsteps": {
      // 2 approaching footsteps on floor
      const duration = 0.85;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      const stepTimes = [0.05, 0.45];
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        let s = 0;
        for (let stepIdx = 0; stepIdx < stepTimes.length; stepIdx++) {
          const st = t - stepTimes[stepIdx];
          if (st >= 0 && st < 0.15) {
            const heel = Math.sin(2 * Math.PI * 140 * st) * Math.exp(-st * 28) * (0.6 + stepIdx * 0.2);
            const tap = (Math.random() * 2 - 1) * Math.exp(-st * 45) * 0.3;
            s += heel + tap;
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

    source.connect(gainNode);
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
export function scheduleFoleyForMessage(
  context: AudioContext,
  messageText: string,
  baseTime?: number,
  volume = 0.60
): AudioBufferSourceNode[] {
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
