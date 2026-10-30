/**
 * Catálogo completo de la Galería de Sonidos Cinemáticos (Soundbank)
 * Soporta expresiones vocales, foley físico, acciones cotidianas y paisajes sonoros.
 */

export type VocalSoundId =
  | "moan_pleasure"      // Gemidos apasionados de placer y deseo
  | "moan_subtle"        // Gemido suave, ahogado o contenido
  | "scream_pleasure"    // Grito / chillido extático de clímax
  | "scream_pain"        // Grito de dolor, impacto o alarma
  | "gasp_breathless"    // Jadeo sofocado, falta de aire repentina
  | "pant_running"       // Respiración agitada por esfuerzo o carrera
  | "cry_deep"           // Llanto profundo, sollozos con respiración rota
  | "laugh_chuckle"      // Risita pícara, baja o cómplice
  | "laugh_burst"        // Carcajada abierta, risa espontánea
  | "guttural_groan"     // Sonido gutural, quejido ronco o gruñido
  | "kiss_wet"
  | "oral_suction";          // Beso apasionado, chasquido húmedo de labios

export type ImpactFoleyId =
  | "wall_slam"          // Golpe contundente contra la pared / empujón sordo
  | "flesh_impact"       // Choque de piel contra piel, nalgada, palmada carnal
  | "slap"               // Bofetada resonante en la mejilla
  | "bed_creak"          // Crujido de cama, muelles o madera cediendo
  | "fabric_sheets"      // Roce de sábanas, desvestirse, caída de ropa
  | "zipper";            // Desabrochar o subir cremallera metálica

export type ActionFoleyId =
  | "footsteps_normal"   // Pasos regulares acercándose o alejándose
  | "footsteps_heels"    // Tacones resonando en piso duro
  | "footsteps_running"  // Pasos apresurados o carrera
  | "door_open_close"    // Puerta abriéndose o cerrándose suave
  | "door_slam"          // Portazo fuerte y seco
  | "door_lock"          // Giro de llave, cerrojo o pestillo metálico
  | "glasses_clink"      // Choque de copas, brindis de cristal
  | "pour_liquid"        // Servir trago, vino, descorchar
  | "applause";          // Aplausos de multitud o aplauso individual

export type AmbianceScoreId =
  | "rain_window"        // Lluvia constante y goteo en ventana
  | "thunder_storm"      // Tormenta con trueno retumbante lejano
  | "wind_night"         // Viento nocturno suave en habitación
  | "salon_music";       // Música suave de salón / piano íntimo de fondo

export type SoundId =
  | VocalSoundId
  | ImpactFoleyId
  | ActionFoleyId
  | AmbianceScoreId;

export type SoundCategory = "vocal" | "impact" | "action" | "ambiance";

export interface SoundDefinition {
  id: SoundId;
  name: string;
  category: SoundCategory;
  description: string;
  defaultVolume: number;
  durationSec: number;
}

export interface DetectedSoundEvent {
  soundId: SoundId;
  matchedText: string;
  delaySec: number;
  volume: number;
}
