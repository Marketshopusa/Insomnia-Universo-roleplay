import type { SoundId } from "./types";

const soundPcmCache = new Map<string, Float32Array>();

/**
 * Generador procedural de alta fidelidad acústica para cada sonido de la galería.
 * Produce formas de onda PCM estéreo/mono a 32-bit float sin latencia ni costo de red.
 */
export function generateSoundPcm(soundId: SoundId, sampleRate = 24000): Float32Array {
  const cacheKey = `${soundId}_${sampleRate}`;
  if (soundPcmCache.has(cacheKey)) return soundPcmCache.get(cacheKey)!;

  let buffer: Float32Array;

  switch (soundId) {
    // -------------------------------------------------------------
    // IMPACTOS FÍSICOS Y SALA
    // -------------------------------------------------------------
    case "wall_slam": {
      // Golpe contundente y sordo contra estructura: subgrave profundo 52Hz + resonancia de madera sin chirridos
      const duration = 0.48;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      let wallLow = 0;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const sub = Math.sin(2 * Math.PI * 48 * t) * Math.exp(-t * 14) * 0.95;
        const woodThump = Math.sin(2 * Math.PI * 88 * t) * Math.exp(-t * 18) * 0.55;
        const rawNoise = (Math.random() * 2 - 1) * Math.exp(-t * 35);
        wallLow = wallLow * 0.88 + rawNoise * 0.12;
        const mixed = sub + woodThump + wallLow * 0.4;
        buffer[i] = Math.tanh(mixed * 1.25) * 0.88;
      }
      break;
    }

    case "flesh_impact": {
      // Impacto visceral cuerpo a cuerpo / piel contra piel: cuerpo sordo orgánico (55Hz) sin barrido de frecuencia
      const duration = 0.55;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      let noiseFilt1 = 0;
      let noiseFilt2 = 0;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        let sample = 0;

        // Primer pulso de impacto (t = 0): grave limpio 55Hz + toque sordo
        if (t < 0.28) {
          const t1 = t;
          const sub = Math.sin(2 * Math.PI * 55 * t1) * Math.exp(-t1 * 18) * 0.9;
          const bodyThud = Math.sin(2 * Math.PI * 105 * t1) * Math.exp(-t1 * 22) * 0.45;
          const noise = (Math.random() * 2 - 1) * Math.exp(-t1 * 50);
          noiseFilt1 = noiseFilt1 * 0.82 + noise * 0.18;
          sample += sub + bodyThud + noiseFilt1 * 0.35;
        }

        // Segundo pulso de cadencia rítmica (t = 0.26s)
        if (t >= 0.25) {
          const t2 = t - 0.25;
          const sub2 = Math.sin(2 * Math.PI * 52 * t2) * Math.exp(-t2 * 17) * 0.82;
          const bodyThud2 = Math.sin(2 * Math.PI * 100 * t2) * Math.exp(-t2 * 20) * 0.4;
          const noise2 = (Math.random() * 2 - 1) * Math.exp(-t2 * 50);
          noiseFilt2 = noiseFilt2 * 0.82 + noise2 * 0.18;
          sample += sub2 + bodyThud2 + noiseFilt2 * 0.3;
        }

        buffer[i] = Math.tanh(sample * 1.2) * 0.85;
      }
      break;
    }

    case "slap": {
      // Impacto sordo orgánico de piel: subgrave 68Hz + chasquido amortiguado sin chirridos
      const duration = 0.22;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      let noiseFilter = 0;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const sub = Math.sin(2 * Math.PI * 68 * t) * Math.exp(-t * 28) * 0.8;
        const raw = (Math.random() * 2 - 1) * Math.exp(-t * 40);
        noiseFilter = noiseFilter * 0.8 + raw * 0.2;
        buffer[i] = Math.tanh((sub + noiseFilter * 0.35) * 1.2) * 0.85;
      }
      break;
    }

    case "bed_creak": {
      // Crujido de resortes de cama y madera cediendo con tensión acústica real
      const duration = 0.55;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const woodLow = Math.sin(2 * Math.PI * (85 + 25 * Math.sin(2 * Math.PI * 12 * t)) * t) * Math.exp(-t * 5.5) * 0.45;
        const coilHarmonic = Math.sin(2 * Math.PI * (280 + 90 * Math.sin(2 * Math.PI * 16 * t)) * t) * Math.exp(-t * 7.5) * 0.35;
        const springStrain = Math.sin(2 * Math.PI * 420 * t) * Math.exp(-t * 12) * 0.2;
        buffer[i] = Math.tanh((woodLow + coilHarmonic + springStrain) * 1.4) * 0.85;
      }
      break;
    }

    case "fabric_sheets": {
      // Roce sedoso de sábanas y ropa deslizándose
      const duration = 0.55;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      let filter = 0;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const env = Math.sin(Math.PI * (t / duration));
        const raw = (Math.random() * 2 - 1);
        filter = filter * 0.82 + raw * 0.18;
        const rustle = filter * Math.sin(2 * Math.PI * 850 * t) * env * 0.55;
        buffer[i] = Math.max(-1, Math.min(1, rustle));
      }
      break;
    }

    case "zipper": {
      // Deslizamiento textil sordo y suave sin frecuencias agudas estridentes
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

    // -------------------------------------------------------------
    // ACCIONES COTIDIANAS Y ENTORNO
    // -------------------------------------------------------------
    case "footsteps_heels": {
      // Tacones resonando en suelo duro
      const duration = 0.28;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const heelClick = Math.sin(2 * Math.PI * (2400 * Math.exp(-t * 50) + 800) * t) * Math.exp(-t * 55) * 0.85;
        const soleThud = Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t * 22) * 0.45;
        buffer[i] = Math.max(-1, Math.min(1, heelClick + soleThud));
      }
      break;
    }

    case "footsteps_running":
    case "footsteps_normal": {
      // Pasos secos
      const duration = 0.32;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      let noiseFilter = 0;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const thud = Math.sin(2 * Math.PI * (140 * Math.exp(-t * 30) + 50) * t) * Math.exp(-t * 20) * 0.7;
        const raw = (Math.random() * 2 - 1) * Math.exp(-t * 40);
        noiseFilter = noiseFilter * 0.75 + raw * 0.25;
        buffer[i] = Math.max(-1, Math.min(1, thud + noiseFilter * 0.4));
      }
      break;
    }

    case "door_slam": {
      // Portazo fuerte con reverberación
      const duration = 0.65;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      let rumble = 0;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const bang = Math.sin(2 * Math.PI * (95 * Math.exp(-t * 20) + 38) * t) * Math.exp(-t * 12) * 0.9;
        const raw = (Math.random() * 2 - 1) * Math.exp(-t * 15);
        rumble = rumble * 0.8 + raw * 0.2;
        buffer[i] = Math.max(-1, Math.min(1, bang + rumble * 0.5));
      }
      break;
    }

    case "door_lock": {
      // Cerrojo y giro de llave
      const duration = 0.32;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        let s = 0;
        if (t < 0.08) s += (Math.random() * 2 - 1) * Math.sin(2 * Math.PI * 2800 * t) * Math.exp(-t * 18) * 0.35;
        if (t >= 0.10) {
          const t2 = t - 0.10;
          s += Math.sin(2 * Math.PI * (260 * Math.exp(-t2 * 30) + 85) * t2) * Math.exp(-t2 * 28) * 0.75;
          s += Math.sin(2 * Math.PI * 3400 * t2) * Math.exp(-t2 * 60) * 0.4;
        }
        buffer[i] = Math.max(-1, Math.min(1, s));
      }
      break;
    }

    case "door_open_close": {
      // Puerta suave
      const duration = 0.35;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const hinge = Math.sin(2 * Math.PI * 320 * t) * Math.exp(-t * 12) * 0.35;
        const latch = Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 40) * 0.4;
        buffer[i] = Math.max(-1, Math.min(1, hinge + latch));
      }
      break;
    }

    case "glasses_clink": {
      // Brindis de cristal fino y resonancia
      const duration = 0.85;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const ping1 = Math.sin(2 * Math.PI * 2780 * t) * Math.exp(-t * 4.5) * 0.65;
        const ping2 = Math.sin(2 * Math.PI * 3520 * t) * Math.exp(-t * 5.2) * 0.45;
        buffer[i] = Math.max(-1, Math.min(1, ping1 + ping2));
      }
      break;
    }

    case "pour_liquid": {
      // Servir vino / líquido en copa
      const duration = 0.75;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const bubble = Math.sin(2 * Math.PI * (450 + 180 * Math.sin(2 * Math.PI * 14 * t)) * t) * 0.35;
        const splash = (Math.random() * 2 - 1) * Math.sin(Math.PI * (t / duration)) * 0.25;
        buffer[i] = Math.max(-1, Math.min(1, bubble + splash));
      }
      break;
    }

    case "applause": {
      // Aplausos
      const duration = 0.95;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      let clapFilter = 0;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const raw = (Math.random() * 2 - 1);
        clapFilter = clapFilter * 0.88 + raw * 0.12;
        const bursts = Math.sin(2 * Math.PI * 8 * t) * 0.3 + 0.7;
        buffer[i] = Math.max(-1, Math.min(1, clapFilter * bursts * 0.75));
      }
      break;
    }

    // -------------------------------------------------------------
    // PAISAJE SONORO Y MÚSICA AMBIENTAL
    // -------------------------------------------------------------
    case "rain_window": {
      // Lluvia relajante y goteo constante
      const duration = 1.6;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      let pink1 = 0, pink2 = 0;
      for (let i = 0; i < length; i++) {
        const raw = (Math.random() * 2 - 1);
        pink1 = pink1 * 0.92 + raw * 0.08;
        pink2 = pink2 * 0.75 + raw * 0.25;
        // Pequeñas gotas aleatorias impactando el vidrio
        const drop = Math.random() < 0.003 ? (Math.random() * 2 - 1) * 0.35 : 0;
        buffer[i] = Math.max(-1, Math.min(1, pink1 * 0.45 + pink2 * 0.25 + drop));
      }
      break;
    }

    case "thunder_storm": {
      // Trueno lejano retumbante
      const duration = 1.8;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      let lowRumble = 0;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const envelope = t < 0.3 ? t / 0.3 : Math.exp(-(t - 0.3) * 2.2);
        const sub = Math.sin(2 * Math.PI * 38 * t) * envelope * 0.8;
        const raw = (Math.random() * 2 - 1) * envelope;
        lowRumble = lowRumble * 0.85 + raw * 0.15;
        buffer[i] = Math.max(-1, Math.min(1, sub + lowRumble * 0.7));
      }
      break;
    }

    case "wind_night": {
      // Viento nocturno sutil
      const duration = 1.4;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      let windFilter = 0;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const mod = Math.sin(2 * Math.PI * 0.5 * t) * 0.4 + 0.6;
        const raw = (Math.random() * 2 - 1);
        windFilter = windFilter * 0.94 + raw * 0.06;
        buffer[i] = Math.max(-1, Math.min(1, windFilter * mod * 0.5));
      }
      break;
    }

    case "salon_music": {
      // Acorde íntimo y cálido de piano / salón suave
      const duration = 1.6;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      // Acorde suave: Do mayor / La menor (261Hz, 329Hz, 392Hz, 523Hz)
      const freqs = [261.63, 329.63, 392.00, 523.25];
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const env = Math.exp(-t * 1.8);
        let note = 0;
        for (const f of freqs) {
          note += Math.sin(2 * Math.PI * f * t) * 0.18;
        }
        buffer[i] = Math.max(-1, Math.min(1, note * env));
      }
      break;
    }

    // -------------------------------------------------------------
    // EXPRESIONES VOCALES Y PASIÓN
    // -------------------------------------------------------------
    case "gasp_breathless": {
      // Jadeo sofocado / falta de aire
      const duration = 0.42;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      let breathFilter = 0;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const env = t < 0.12 ? t / 0.12 : Math.exp(-(t - 0.12) * 7.5);
        const raw = (Math.random() * 2 - 1);
        breathFilter = breathFilter * 0.72 + raw * 0.28;
        const vocalFriction = Math.sin(2 * Math.PI * 520 * t) * 0.25;
        buffer[i] = Math.max(-1, Math.min(1, (breathFilter + vocalFriction) * env * 0.8));
      }
      break;
    }

    case "pant_running": {
      // Respiración agitada rápida
      const duration = 0.55;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      let pFilter = 0;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const cycle = Math.sin(2 * Math.PI * 3.5 * t);
        const env = cycle > 0 ? cycle : 0;
        const raw = (Math.random() * 2 - 1);
        pFilter = pFilter * 0.68 + raw * 0.32;
        buffer[i] = Math.max(-1, Math.min(1, pFilter * env * 0.75));
      }
      break;
    }

    case "moan_pleasure": {
      // Gemido vocal sensual y apasionado: modelo de formantes vocales humanos (F1: 520Hz, F2: 1200Hz) con aire
      const duration = 0.95;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      let breathFilter = 0;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        // Envolvente de crescendo y desvanecimiento suave
        const env = Math.pow(Math.sin(Math.PI * (t / duration)), 1.3);
        const f0 = 210 + 28 * Math.sin(2 * Math.PI * 4.5 * t); // Entonación fundamental humana
        // Pulsos glóticos con armónicos ricos
        const glottal = Math.sin(2 * Math.PI * f0 * t) * 0.5 + Math.sin(2 * Math.PI * f0 * 2 * t) * 0.3 + Math.sin(2 * Math.PI * f0 * 3 * t) * 0.15;
        // Resonancia de cavidad vocal (formantes)
        const formant1 = Math.sin(2 * Math.PI * 520 * t) * 0.45;
        const formant2 = Math.sin(2 * Math.PI * 1250 * t) * 0.25;
        // Turbulencia de aire de respiración jadeante
        const noise = (Math.random() * 2 - 1) * 0.35;
        breathFilter = breathFilter * 0.75 + noise * 0.25;
        const vocalCore = (glottal * (formant1 + formant2) + breathFilter) * env;
        buffer[i] = Math.tanh(vocalCore * 1.5) * 0.85;
      }
      break;
    }

    case "moan_subtle": {
      // Gemido leve o contenido: aire exhalado íntimo y suave
      const duration = 0.55;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      let breath = 0;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const env = Math.sin(Math.PI * (t / duration));
        const f0 = 230 + 15 * Math.sin(2 * Math.PI * 5 * t);
        const glottal = Math.sin(2 * Math.PI * f0 * t) * 0.4;
        const formant = Math.sin(2 * Math.PI * 480 * t) * 0.35;
        const rawNoise = (Math.random() * 2 - 1) * 0.35;
        breath = breath * 0.78 + rawNoise * 0.22;
        buffer[i] = Math.tanh((glottal * formant + breath * 0.6) * env * 1.4) * 0.75;
      }
      break;
    }

    case "scream_pleasure": {
      // Grito de clímax extático con resonancia vocal viva
      const duration = 1.1;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      let air = 0;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const env = t < 0.18 ? t / 0.18 : Math.exp(-(t - 0.18) * 2.2);
        const pitch = 520 + 75 * Math.sin(2 * Math.PI * 5.8 * t);
        const vocal = Math.sin(2 * Math.PI * pitch * t) * 0.6 + Math.sin(2 * Math.PI * (pitch * 1.95) * t) * 0.35;
        const formant = Math.sin(2 * Math.PI * 1400 * t) * 0.25;
        air = air * 0.7 + (Math.random() * 2 - 1) * 0.3;
        buffer[i] = Math.tanh((vocal + formant + air * 0.35) * env * 1.5) * 0.9;
      }
      break;
    }

    case "scream_pain": {
      // Grito desgarrador de dolor
      const duration = 0.75;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const env = t < 0.08 ? t / 0.08 : Math.exp(-(t - 0.08) * 3.5);
        const f1 = Math.sin(2 * Math.PI * 720 * t) * 0.7;
        const f2 = Math.sin(2 * Math.PI * 1150 * t) * 0.45;
        buffer[i] = Math.max(-1, Math.min(1, (f1 + f2) * env * 0.95));
      }
      break;
    }

    case "cry_deep": {
      // Llanto profundo y sollozo
      const duration = 0.95;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const sobRate = 4.2;
        const sobEnvelope = Math.abs(Math.sin(2 * Math.PI * sobRate * t)) * Math.exp(-t * 1.5);
        const tone = Math.sin(2 * Math.PI * (310 + 40 * Math.sin(2 * Math.PI * 8 * t)) * t) * 0.55;
        const breath = (Math.random() * 2 - 1) * 0.25;
        buffer[i] = Math.max(-1, Math.min(1, (tone + breath) * sobEnvelope * 0.8));
      }
      break;
    }

    case "guttural_groan": {
      // Gruñido o quejido gutural bajo
      const duration = 0.45;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const env = Math.sin(Math.PI * (t / duration));
        const rasp = Math.sin(2 * Math.PI * 95 * t) * 0.65 + Math.sin(2 * Math.PI * 190 * t) * 0.35;
        buffer[i] = Math.max(-1, Math.min(1, rasp * env * 0.85));
      }
      break;
    }

    case "kiss_wet": {
      // Chasquido suave y cálido de labios sin barridos estridentes
      const duration = 0.22;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      let filteredNoise = 0;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const pop = Math.sin(2 * Math.PI * 340 * t) * Math.exp(-t * 35) * 0.65;
        const raw = (Math.random() * 2 - 1) * Math.exp(-t * 40);
        filteredNoise = filteredNoise * 0.82 + raw * 0.18;
        buffer[i] = Math.tanh((pop + filteredNoise * 0.3) * 1.1) * 0.75;
      }
      break;
    }

    case "laugh_burst": {
      // Carcajada abierta
      const duration = 0.95;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const pulse = Math.abs(Math.sin(2 * Math.PI * 4 * t)) * Math.exp(-t * 1.2);
        const voice = Math.sin(2 * Math.PI * 340 * t) * 0.6;
        buffer[i] = Math.max(-1, Math.min(1, voice * pulse * 0.8));
      }
      break;
    }

    case "laugh_chuckle": {
      // Risita baja y cómplice
      const duration = 0.48;
      const length = Math.floor(sampleRate * duration);
      buffer = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const pulse = Math.abs(Math.sin(2 * Math.PI * 5 * t)) * Math.exp(-t * 2);
        const voice = Math.sin(2 * Math.PI * 420 * t) * 0.45;
        buffer[i] = Math.max(-1, Math.min(1, voice * pulse * 0.65));
      }
      break;
    }

    default:
      buffer = new Float32Array(sampleRate * 0.1);
  }

  soundPcmCache.set(cacheKey, buffer);
  return buffer;
}
