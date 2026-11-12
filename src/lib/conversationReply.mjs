const normalize = (text) => String(text || "").toLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
const dialogue = (text) => normalize(String(text || "").replace(/\*[^*]*\*/g, " "));

/** Recall and explicit repetition are valid uses of a conversation's memory. */
export function requestsRecall(latest = "") {
  return /\b(?:recuerd\w*|recorda\w*|repite\w*|repit\w*|repet\w*|resum\w*|recapitul\w*|remember|repeat|recap|remind|summar\w*)\b|(?:\bdime\b|\bcual(?:es)?\b).{0,100}\bmis?\b/i.test(normalize(latest));
}

/** Shared browser/server repetition policy; normal overlap is not a duplicate. */
export function isRepeatedTurn(candidate, history = [], latest = "") {
  const full = normalize(candidate);
  if (!full) return true;
  if (requestsRecall(latest)) return false;
  const spoken = dialogue(candidate);
  const words = spoken.split(" ").filter(Boolean);
  const previous = history.filter((entry) => entry?.role === "assistant" || entry?.role === "model")
    .map((entry) => entry.content || entry.text || "").filter(Boolean).slice(-6);
  for (const text of previous) {
    if (full === normalize(text)) return true;
    const past = dialogue(text);
    if (spoken.length >= 20 && spoken === past) return true;
    if (words.length < 8 || past.split(" ").length < 8) continue;
    const pastWords = past.split(" ");
    const phrases = new Set();
    for (let index = 0; index <= pastWords.length - 4; index++) phrases.add(pastWords.slice(index, index + 4).join(" "));
    let hits = 0;
    for (let index = 0; index <= words.length - 4; index++) {
      if (phrases.has(words.slice(index, index + 4).join(" "))) hits += 1;
    }
    if (hits / (words.length - 3) >= 0.7) return true;
  }
  return false;
}
