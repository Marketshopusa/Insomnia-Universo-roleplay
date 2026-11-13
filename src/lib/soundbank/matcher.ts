import type { DetectedSoundEvent } from "./types";
import { detectSoundEvents as detect, detectPhysicalSoundEvents as physical } from "./matcher.mjs";
export { VOCAL_SOUND_IDS, soundActionClauses } from "./matcher.mjs";
export const detectSoundEvents = (text: string): DetectedSoundEvent[] => detect(text);
export const detectPhysicalSoundEvents = (text: string): DetectedSoundEvent[] => physical(text);
