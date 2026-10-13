import bank from "./vocalSamples/Aoede_es.json" with { type: "json" };
const clips = new Map();
/** Same-voice neural sounds, verified without dialogue or spoken cue names. */
export function vocalSample(voice, language = "es", event, direction = "") {
  if (bank.verification !== "automated_pass" || voice !== bank.voice || language !== bank.language) return null;
  const alias = { cry: "sob", chuckle: "laugh", scream: "pain_scream", groan: "grunt" }[event] || event;
  const encoded = bank.clips[alias];
  if (!encoded) return null;
  if (!clips.has(alias)) clips.set(alias, Buffer.from(encoded, "base64"));
  const source = clips.get(alias);
  const gentle = /quiet|gentle/i.test(direction) || event === "chuckle";
  if (!gentle && event !== "chuckle") return source;
  const length = event === "chuckle" ? Math.min(source.length, 67_200) : source.length;
  const output = Buffer.from(source.subarray(0, length));
  const edge = 480;
  for (let i = 0; i < output.length; i += 2) {
    const fade = event === "chuckle" ? Math.min(1, (output.length - i) / edge) : 1;
    output.writeInt16LE(Math.round(output.readInt16LE(i) * 0.7 * fade), i);
  }
  return output;
}
