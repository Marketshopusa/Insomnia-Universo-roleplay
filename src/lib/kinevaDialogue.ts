/** Divide una frase larga en tomas que el motor puede pronunciar completas. */
export function splitKinevaDialogue(text: string, maxWords = 20): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const chunks: string[] = [];
  for (let start = 0; start < words.length; start += maxWords) {
    chunks.push(words.slice(start, start + maxWords).join(" "));
  }
  return chunks;
}
