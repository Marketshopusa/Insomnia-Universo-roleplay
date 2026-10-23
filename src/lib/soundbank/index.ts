import type { SoundId, DetectedSoundEvent } from "./types";
import { detectSoundEvents } from "./matcher";
import { generateSoundPcm } from "./audioSynthesizer";

export * from "./types";
export * from "./matcher";
export * from "./audioSynthesizer";

/**
 * Reproduce un sonido de la galería en el AudioContext con filtrado acústico cálido (anti-distorsión).
 */
export function playCinematicSound(
  context: AudioContext,
  soundId: SoundId,
  startTime?: number,
  volume = 0.65
): AudioBufferSourceNode | null {
  try {
    const pcm = generateSoundPcm(soundId, context.sampleRate || 24000);
    const audioBuffer = context.createBuffer(1, pcm.length, context.sampleRate || 24000);
    audioBuffer.copyToChannel(pcm, 0);

    const source = context.createBufferSource();
    source.buffer = audioBuffer;

    const gainNode = context.createGain();
    const clampedVolume = Math.max(0, Math.min(1, volume));
    gainNode.gain.setValueAtTime(clampedVolume, context.currentTime);

    // Filtro analógico cinemático cálido (biquad lowpass)
    if (typeof context.createBiquadFilter === "function") {
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      const cutoff = soundId.startsWith("wall") || soundId.startsWith("flesh")
        ? 2200
        : soundId.startsWith("rain") || soundId.startsWith("thunder")
          ? 3800
          : 4500;
      filter.frequency.setValueAtTime(cutoff, context.currentTime);
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
    console.warn("Cinematic Soundbank playback failed:", err);
    return null;
  }
}

/**
 * Orquesta y programa en la línea de tiempo del AudioContext todos los sonidos detectados en la escena.
 * Funciona de forma idéntica y sincronizada tanto en Mensajes de Chat, como en Llamadas y Narración de Historias.
 */
export function scheduleCinematicScene(
  context: AudioContext,
  messageText: string,
  baseTime?: number,
  masterVolume = 0.65
): AudioBufferSourceNode[] {
  const events: DetectedSoundEvent[] = detectSoundEvents(messageText);
  if (!events.length) return [];

  const start = baseTime ?? context.currentTime;
  const sources: AudioBufferSourceNode[] = [];

  for (const event of events) {
    const source = playCinematicSound(
      context,
      event.soundId,
      start + event.delaySec,
      event.volume * masterVolume
    );
    if (source) sources.push(source);
  }

  return sources;
}
