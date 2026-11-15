// Fingerprints identify retired catalog scripts for cleanup; no scripted answer is stored or emitted.
const retired: Record<string, string[]> = {
  "olivia-adams": [
    "89:854044284",
    "89:854044284",
    "100:3319548856"
  ],
  "aria": [
    "127:506245974",
    "127:506245974",
    "155:2572518702"
  ],
  "sweet": [
    "128:749174562",
    "128:749174562",
    "132:4246328042"
  ],
  "chloe": [
    "129:4252884979",
    "129:4252884979",
    "133:3793265296"
  ],
  "jennifer": [
    "124:2910260170",
    "124:2910260170",
    "114:3277805906"
  ],
  "ava": [
    "111:4069820776",
    "111:4069820776",
    "132:995090172"
  ],
  "lola": [
    "100:909303312",
    "100:909303312",
    "112:1959142409"
  ],
  "softbunny": [
    "118:4153017122",
    "118:4153017122",
    "119:317884790"
  ],
  "roxy": [
    "116:1422108025",
    "116:1422108025",
    "116:288995794"
  ]
};
function fingerprint(text: string) { let value = 2166136261; for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619) >>> 0; return text.length + ":" + value; }
export function chatSceneContext(card: { id: string; bio: string; bioEs?: string; bioEn?: string; starterMessage: string; starterMessageEs?: string; starterMessageEn?: string }, spanish: boolean) {
 const bio = (spanish ? card.bioEs : card.bioEn) || card.bio;
 const opening = (spanish ? card.starterMessageEs : card.starterMessageEn) || card.starterMessage;
 if (!opening || retired[card.id]?.includes(fingerprint(opening))) return bio;
 return [bio, (spanish ? "Situación inicial definida en la tarjeta (contexto, no un turno ya hablado): " : "Opening situation defined in the card (context, not an already spoken turn): ") + opening].filter(Boolean).join("\n");
}
