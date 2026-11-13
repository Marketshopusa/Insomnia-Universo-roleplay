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
  return isStalledReply(candidate, history, latest);
}

const filler = new Set('a al algo ante aqui asi ahora aun aunque bajo bien claro como con cual cuando de del desde donde el ella ellas ello ellos en entre era eramos es esa ese eso esta estamos estan estar estas este esto fue ha hasta hay incluso juntos la las le les lo los me mi mis mismo mucho muy nada ni no nos nosotros nuestra nuestras nuestro nuestros o otra otro para pero poco por porque pues que quien qué se sea ser si sí sin solo somos son soy su sus tal tambien tan te ti tiene todo todos tu tus un una unas uno unos usted ustedes vale y ya yo'.split(' '));
const meaning = (value) => new Set(dialogue(value).split(' ').filter((word) => word.length > 2 && !filler.has(word)));

/** A clarification needs new substance, rather than a shorter version of the same evasion. */
export function isStalledReply(candidate, history = [], latest = '') {
  if (requestsRecall(latest)) return false;
  const question = normalize(latest);
  if (!/\b(?:para que|por que|que necesitas|que quieres|que significa|a que te refieres|de que hablas|eso ya|no te pregunte|vuelvo a preguntar|vuelvo pregunto|sigo preguntando)\b/u.test(question)) return false;
  const previous = history.filter((entry) => entry?.role === 'assistant' || entry?.role === 'model').at(-1);
  if (!previous) return false;
  const oldText = previous.content || previous.text || '';
  const unknown = /\b(?:no se|no lo se|no estoy segur[oa]|no me consta|no lo he visto|i don t know)\b/u;
  if (unknown.test(dialogue(candidate)) && !unknown.test(dialogue(oldText))) return false;
  const keys = meaning(candidate), past = meaning(oldText);
  return keys.size >= 2 && [...keys].every((word) => past.has(word));
}
