import { expect, it } from "vitest";
import { vocalSample } from "./vocalSamples.mjs";
it("provides real PCM for verified Spanish Aoede reactions", () => {
 for (const event of ["pain_scream", "sob", "cry", "laugh", "sigh", "grunt", "pain_groan", "gasp", "pant", "groan", "pleasure_moan", "throat_clear"]) {
  const pcm = vocalSample("Aoede", "es", event);
  expect(pcm.length).toBeGreaterThan(4800);
  expect(pcm.length % 2).toBe(0);
 }
});
it("never substitutes another selected voice or language with Aoede", () => {
 expect(vocalSample("Leda", "es", "sob")).toBeNull();
 expect(vocalSample("Aoede", "en", "sob")).toBeNull();
});
it("makes a quiet chuckle shorter and softer than full laughter", () => {
 const laugh = vocalSample("Aoede", "es", "laugh");
 const chuckle = vocalSample("Aoede", "es", "chuckle");
 expect(chuckle.length).toBeLessThan(laugh.length);
 const energy = (pcm) => { let total=0; for(let i=0;i<pcm.length;i+=2) total += pcm.readInt16LE(i)**2; return total/(pcm.length/2); };
 expect(energy(chuckle)).toBeLessThan(energy(laugh));
});
