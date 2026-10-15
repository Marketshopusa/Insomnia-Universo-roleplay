/** One ordered performance score shared by story playback and neural TTS. */
const reaction = (id, cue, performance, direction) => ({ id, cue, performance, direction });
export const VOCAL_REACTIONS = Object.freeze({
  pain_scream: reaction("pain_scream", "[shouting] ¡Aaaah!", "pain", "A loud, powerful, agonizing scream of pain, sharp, piercing and forceful; not a calm spoken 'ay'."),
  scream: reaction("scream", "[shouting] ¡Aaaah!", "scream", "A real, powerful, high-energy scream, loud and forceful with full intensity; do not merely announce or describe a scream."),
  cry: reaction("cry", "Ah... hh... ah...", "sad", "Audible, deep, tearful crying with trembling breath and intense broken exhalations; not a sigh and not the spoken word 'crying'."),
  sob: reaction("sob", "Hh... ah... hh...", "sad", "A sharp, audible sob of grief and sorrow, with an interrupted inhalation and trembling exhalation; not a sigh."),
  laugh: reaction("laugh", "[laughing] Ja, ja, ja...", "amused", "One brief natural laugh lasting at most 1.6 seconds; stop completely before speaking. The written ja syllables are a phonetic guide: make a real laugh, not separately spoken ja words."),
  chuckle: reaction("chuckle", "[laughing] Ja, ja, ja...", "amused", "One quiet chuckle lasting at most 0.8 seconds; stop completely before speaking."),
  sigh: reaction("sigh", "[sigh]", "soft", "A natural audible sigh, with a clearly exhaled breath."),
  gasp: reaction("gasp", "¡Hah!", "surprised", "A sharp, dramatic, surprised intake of breath, full of shock or breathless intensity."),
  pant: reaction("pant", "Hh... hh...", "soft", "Two short, ragged, breathless gasps of intense exertion or excitement."),
  pain_groan: reaction("pain_groan", "Aaagh...", "pain", "An intense, strained groan of physical pain or effort, with a tight rough voice; not a relaxed sigh or a calm spoken ay."),
  groan: reaction("groan", "Aah...", "neutral", "An expressive, audible groan matching the scene with real emotional presence; not a yawn or tired stretch."),
  pleasure_moan: reaction("pleasure_moan", "Ah... mmm...", "pleasure", "An intense, passionate, breathy, visceral groan of pleasure and desire, vivid and expressive with real emotional weight; never a tired yawn or weak sigh."),
  grunt: reaction("grunt", "¡Urrgh!", "neutral", "A short rough guttural grunt of physical effort, made low in the throat. Not a thoughtful hum or the word hmm."),
  growl: reaction("growl", "Grrr...", "neutral", "A brief low human growl, a guttural vocal reaction, not an animal sound unless explicitly specified."),
  cough: reaction("cough", "Cof, cof.", "neutral", "One natural audible cough; do not say the name of the sound."),
  sneeze: reaction("sneeze", "¡Achís!", "neutral", "One natural sneeze, preserving the speaker's voice."),
  hiccup: reaction("hiccup", "¡Hip!", "neutral", "One short audible hiccup, not the word 'hiccup'."),
  throat_clear: reaction("throat_clear", "Ejem.", "neutral", "A brief natural throat clearing."),
  kiss: reaction("kiss", "Mua.", "neutral", "One brief lip-smack kiss sound, not a spoken 'muah'."),
  hesitation: reaction("hesitation", "[uhm]", "neutral", "A brief natural voiced hesitation."),
});

const forms = [
  ["scream", "grit(?:os?|a|é|ó|amos|aron|aba|ando|ar|as|an)|chill(?:o|a|é|ó|ando)|alaridos?|scream(?:s|ed|ing)?|shout(?:s|ed|ing)?"],
  ["sob", "solloz(?:os?|a|ó|ando|ar|aba)|sob(?:s|bed|bing)?"],
  ["cry", "llor(?:o|a|é|ó|ando|ar|aba|amos|aron)|llantos?|cry(?:ing|ies)?|cried"],
  ["chuckle", "risita|risa\\s+bajita|chuckl(?:e|es|ed|ing)"],
  ["laugh", "r(?:ío|íe|ió|iendo)|re(?:í|ír)|carcajadas?|risas?|laugh(?:s|ed|ing)?|(?:j[aei]|h[aeo])(?:[\\s,.…-]*(?:j[aei]|h[aeo])){1,}"],
  ["sigh", "suspir(?:o|a|é|ó|ando|ar)|resopl(?:o|a|é|ó|ando)|sigh(?:s|ed|ing)?"],
  ["gasp", "boque(?:o|a|ó|ando)|aspir(?:o|a|ó)\\s+(?:aire\\s+)?(?:de\\s+golpe|bruscamente)|gasp(?:s|ed|ing)?"],
  ["pant", "jade(?:os?|a|ó|ando|ar)|respir(?:o|a|ó|ando)\\s+(?:agitadamente|con\\s+dificultad)|pant(?:s|ed|ing)?"],
  ["groan", "g(?:imo|ime|emí|imió|imiendo)|gemidos?|moan(?:s|ed|ing)?|groan(?:s|ed|ing)?|mord(?:iendo|er|ió|e|í|erme)\\w*\\s+(?:el\\s+)?labio|ard(?:iendo|er)\\s+de\\s+(?:excitaci[oó]n|deseo)|estremec(?:er|iendo|ió|e|imiento)|tembl(?:ando|or|ar|ó)"],
  ["grunt", "gruñ(?:o|e|ó|endo)|gruñidos?|grunt(?:s|ed|ing)?"],
  ["growl", "rug(?:e|ió|iendo)|sonido\\s+gutural|growl(?:s|ed|ing)?"],
  ["cough", "tos(?:o|e|ió|iendo)|cough(?:s|ed|ing)?"],
  ["sneeze", "estornud(?:o|a|é|ó|ando)|sneez(?:e|es|ed|ing)"],
  ["hiccup", "hipo|hiccups?"],
  ["throat_clear", "carraspe(?:o|a|é|ó|ando)|aclar(?:o|a|ó)\\s+la\\s+garganta|clear(?:s|ed|ing)?\\s+(?:my|her|his|the)\\s+throat"],
  ["kiss", "chasquido\\s+de\\s+(?:beso|labios)|sonido\\s+de\\s+(?:un\\s+)?beso|kiss\\s+sound"],
];
const compounds = {
  scream: String.raw`(?:(?:solt(?:é|ó|amos|aron)|suelto|suelta|peg(?:o|ó|ué)|dej(?:o|é|ó)\s+escapar|doy|da|di|dio)\s+(?:un\s+)?grito|ahog(?:o|a|ué|ó)\s+un\s+grito)`,
  cry: String.raw`(?:(?:me|se)\s+ech(?:o|a|ó)\s+a\s+llorar|romp(?:o|e|í|ió)\s+(?:a\s+llorar|en\s+llanto))`,
  laugh: String.raw`(?:(?:me|se)\s+ech(?:o|a|ó)\s+a\s+reír|(?:solt(?:é|ó|amos|aron)|suelto|suelta|dej(?:o|é|ó)\s+escapar)\s+(?:una\s+)?(?:carcajada|risita|risa)|estall(?:o|a|é|ó)\s+en\s+risas?)`,
  sigh: String.raw`(?:solt(?:é|ó|amos|aron)|suelto|suelta|dej(?:o|é|ó)\s+escapar)\s+un\s+suspiro`,
  pant: String.raw`(?:solt(?:é|ó|amos|aron)|suelto|suelta|dej(?:o|é|ó)\s+escapar)\s+un\s+jadeo`,
  groan: String.raw`(?:solt(?:é|ó|amos|aron)|suelto|suelta|dej(?:o|é|ó)\s+escapar)\s+un\s+gemido`,
  grunt: String.raw`(?:solt(?:é|ó|amos|aron)|suelto|suelta)\s+un\s+gruñido`,
};
const allForms = forms.map(([id, source]) => [id, compounds[id] ? "(?:" + compounds[id] + "|" + source + ")" : source]);
const FORM = new RegExp("(?<![\\p{L}\\p{N}])(?:" + allForms.map(([, source]) => "(?:" + source + ")").join("|") + ")(?![\\p{L}\\p{N}])", "giu");
const exactForm = allForms.map(([id, source]) => [id, new RegExp("^(?:" + source + ")$", "iu")]);
const actionContext = /(?:dolor|duele|herid|golpe|esfuerzo|pain|hurt|injur|effort)/iu;
const pleasureContext = /(?:placer|gozo|pleasure|excit|deseo|pasión|pasion|sensual|calor|rico|rica|delicia|lujuria|tentaci|entrecortad|escalofr|labio|ard)/iu;
const nonPresent = /(?:\b(?:no|sin|not|without|nunca|never)\b|\b(?:quiero|quería|deseo|puedo|podría|debería|intento|intentar|voy\s+a|va\s+a|iba\s+a|si|when|if|want\s+to|will|would|can|could)\b|\b(?:recuerdo|recordé|ayer|yesterday|remember)\b)/iu;
const contextualTail = /^(?:\s+(?:de\s+(?:dolor|placer|miedo|rabia|alegría|felicidad|deseo|excitación|excitacion|pasión|pasion|satisfacción|satisfaccion|anhelo|alivio)|con\s+(?:fuerza|dolor|rabia|picardía|picardia|diversión|diversion|deseo|pasión|pasion|agitación|agitacion)|a\s+carcajadas|desgarrador(?:a|es)?|fuertemente|fuerte|suavemente|suave|bajit[ao]|en\s+voz\s+baja|por\s+(?:el\s+)?(?:esfuerzo|deseo|calor|miedo)|de\s+repente|divertid[ao]|cómplice|complice|entrecortad[ao]|tembloros[ao]|agitad[ao]|aliviad[ao]))*/iu;
const pureSoundDescription = /^(?:(?:yo|ella|él|el|mi|mis|sus|su|un|una|el|la)\s+)?(?:sonidos?\s+desgarradores?|gritos?|gemidos?|sollozos?|llantos?|risas?|carcajadas?)(?:\s|[,.!;]|$)/iu;
const styleFor = (text) => {
  if (/\b(?:no|sin|not|without)\b/iu.test(text)) return null;
  if (/sonr(?:ío|íe|ió)|sonriendo|smil(?:e|es|ed|ing)/iu.test(text)) return "warm";
  if (/susurr(?:o|a|é|ó|ando)|whisper(?:s|ed|ing)?/iu.test(text)) return "soft";
  if (/sorprendid[ao]|sorpresa|surpris(?:e|ed)/iu.test(text)) return "surprised";
  if (/enojad[ao]|furios[ao]|molest[ao]|rabia|angry/iu.test(text)) return "angry";
  if (/asustad[ao]|aterrad[ao]|tembl(?:ando|or).*miedo|afraid|fearful/iu.test(text)) return "afraid";
  if (/asco|disgust(?:ed)?/iu.test(text)) return "disgusted";
  if (/agotad[ao]|cansad[ao]|exhausted|tired/iu.test(text)) return "tired";
  return null;
};

function classify(id, context) {
  if (id === "scream" && actionContext.test(context)) return "pain_scream";
  if (id === "groan") return actionContext.test(context) ? "pain_groan" : pleasureContext.test(context) ? "pleasure_moan" : "groan";
  return id;
}
function tidyNarration(text) {
  let result = text.trim().replace(/^[,;:\s]+|[,;:\s]+$/g, "");
  result = result.replace(/(?:\s+|^)(?:y|e|and)\s*$/iu, "").replace(/^(?:y|e|and)\s+/iu, "");
  if (!result || /^(?:yo|ella|él|el|mi|mis|sus|su|me|se|un|una|el|la)[.!]?$/iu.test(result)) return "";
  if (/^(?:suelto|suelta|solt[éó]|dej[oéó]\s+escapar|doy|dio|di|peg[oóué])\s+(?:un|una)[.!]?$/iu.test(result)) return "";
  if (/^[,.!?\s]+$/.test(result)) return "";
  return result.replace(/^[a-záéíóúñ]/u, (first) => first.toUpperCase());
}
const QUOTES = /("[^"\n]*"|“[^”\n]*”|«[^»\n]*»)/gu;
const STAGES = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|\([^()\n]+\)|\[[^\]\n]+\])/gu;
const taggedReactions = {
  laughing: "laugh", laughs: "laugh", sigh: "sigh", sighs: "sigh", crying: "cry", sobbing: "sob",
  gasping: "gasp", gasps: "gasp", panting: "pant", groaning: "groan", moaning: "groan",
  grunting: "grunt", growling: "growl", coughing: "cough", sneezing: "sneeze", hiccup: "hiccup",
  "clears throat": "throat_clear", kiss: "kiss", uhm: "hesitation",
};

export function prepareExpressiveSpeech(input, { roleplay = false } = {}) {
  const segments = [];
  let delivery = "neutral";
  const addText = (text, kind) => {
    const cleaned = kind === "narration" ? tidyNarration(text) : text.trim();
    if (!cleaned) return;
    segments.push({ kind, text: cleaned, performance: kind === "dialogue" ? delivery : "neutral" });
  };
  const addReaction = (id, context = "") => {
    const base = VOCAL_REACTIONS[id];
    const intensity = /con fuerza|desgarrador|fuertemente|fuerte/iu.test(context) ? " Make this sound intense and forceful." : /suavemente|bajit[ao]|en voz baja/iu.test(context) ? " Make this sound quiet and gentle." : "";
    const item = { ...base, direction: base.direction + intensity };
    segments.push({ kind: "reaction", event: id, ...item });
    delivery = /^(laugh|chuckle)$/.test(id) ? "neutral" : item.performance === "scream" ? "surprised" : item.performance;
  };
  const processAction = (body, marked) => {
    const trimmed = body.trim();
    const known = taggedReactions[trimmed.toLowerCase()];
    if (known) { addReaction(known); return; }
    if (trimmed.toLowerCase() === "whispering") { delivery = "soft"; return; }
    if (trimmed.toLowerCase() === "shouting") { delivery = "scream"; return; }
    for (const sentence of body.match(/[^.!?;]+[.!?;]*/gu) || []) {
      const matches = [...sentence.matchAll(FORM)].filter((match) => {
        const before = sentence.slice(0, match.index);
        if (/^río$/iu.test(match[0]) && /(?:el|un|del|al|este|aquel)\s+$/iu.test(before)) return false;
        const prefix = before.split(/[,;]|\s+(?:y|pero|and|but)\s+/iu).at(-1);
        return !nonPresent.test((prefix || "").replace(/sin dejar de|no puedo dejar de/giu, ""));
      });
      if (!matches.length) {
        if (marked && pureSoundDescription.test(sentence) && /inund|reson|llen|escuch/iu.test(sentence) && segments.at(-1)?.kind === "reaction") continue;
        const style = marked ? styleFor(sentence) : null;
        if (style) delivery = style;
        addText(sentence, marked ? "narration" : "dialogue");
        continue;
      }
      // Unmarked dialogue mentioning somebody else's past sound stays literal.
      const startsWithAction = /^\s*(?:(?:yo|ella|él|el|me)\s+)?(?:solt|suelto|suelta|peg|romp|estall|(?:me|se)\s+ech|dej(?:o|é|ó)\s+escapar|grit|chill|solloz|llor|gim|gem|rí|rió|reí|suspir|jade|gruñ|tos|estornud|carraspe|scream|cry|sob|laugh|sigh|gasp|groan|pant|grunt|cough|sneez)/iu.test(sentence);
      if (!marked && !startsWithAction && !/^\s*(?:j[aei]|h[aeo])(?:[\s,.…-]*(?:j[aei]|h[aeo])){1,}/iu.test(sentence) && !/^\s*(?:ella|él|ellos|ellas|yo)\s/iu.test(sentence) && !pureSoundDescription.test(sentence)) { addText(sentence, "dialogue"); continue; }
      if (matches.length === 1 && pureSoundDescription.test(sentence) && /inund|reson|llen|escuch|desgarrador/iu.test(sentence) && !/\b(?:y|pero|and|but)\b/iu.test(sentence)) {
        const first = matches[0];
        const id = exactForm.find(([, pattern]) => pattern.test(first[0]))?.[0];
        if (id) addReaction(classify(id, sentence), sentence);
        continue;
      }
      let cursor = 0;
      for (const match of matches) {
        if (match.index < cursor) continue;
        addText(sentence.slice(cursor, match.index), "narration");
        const id = exactForm.find(([, pattern]) => pattern.test(match[0]))?.[0];
        if (!id) continue;
        const end = match.index + match[0].length;
        const tail = sentence.slice(end).match(contextualTail)?.[0] || "";
        const nextAction = matches[matches.indexOf(match) + 1]?.index ?? sentence.length;
        const context = sentence.slice(cursor, nextAction);
        addReaction(classify(id, context), context);
        cursor = end + tail.length;
      }
      addText(sentence.slice(cursor), marked || matches.length ? "narration" : "dialogue");
    }
  };
  const processBody = (body, marked) => {
    let cursor = 0;
    for (const match of body.matchAll(QUOTES)) {
      processAction(body.slice(cursor, match.index), marked);
      addText(match[0], "dialogue");
      cursor = match.index + match[0].length;
    }
    processAction(body.slice(cursor), marked);
  };
  const raw = String(input || "");
  const units = new RegExp(STAGES.source + "|" + QUOTES.source, "gu");
  let cursor = 0;
  for (const match of raw.matchAll(units)) {
    processBody(raw.slice(cursor, match.index), false);
    const stage = /^[*([]/u.test(match[0]);
    const content = stage ? match[0].replace(/^\*\*?|\*\*?$/g, "").replace(/^[([]|[)\]]$/g, "") : match[0];
    if (stage) processBody(content, true);
    else addText(content, "dialogue");
    cursor = match.index + match[0].length;
  }
  processBody(raw.slice(cursor), false);
  const hasDialogue = segments.some((part) => part.kind === "dialogue");
  const text = segments
    .map((part) => {
      if (part.kind === "reaction") return part.cue;
      if (roleplay && part.kind === "narration") return "";
      return part.kind === "narration" && !/[.!?…]$/.test(part.text) ? part.text + "." : part.text;
    })
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const reactions = segments.filter((part) => part.kind === "reaction");
  const performances = [...new Set(segments.map((part) => part.performance).filter((value) => value !== "neutral"))];
  return { text, segments, reactions, performance: performances.length === 1 ? performances[0] : "neutral", roleplay };
}

export function hasVocalCue(text) {
  return /\[(?:laughing|sigh|uhm|crying|sobbing|gasping|panting|groaning|moaning|grunting|growling|coughing|sneezing|hiccup|clears throat|kiss)\]/iu.test(text);
}

/** Neural reactions are generated independently, then joined with the spoken runs. */
export function splitExpressiveScore(score, { separate = new Set(), roleplay = score?.roleplay || false } = {}) {
  const runs = [];
  let parts = [];
  let delivery = null;
  const hasDialogue = score.segments.some((part) => part.kind === "dialogue");
  const add = () => {
    if (!parts.length) return;
    const reactions = parts.filter((part) => part.kind === "reaction");
    const hasSpeech = parts.some((part) => part.kind !== "reaction");
    const text = parts
      .map((part) => {
        if (part.kind === "reaction") return hasSpeech && /^(?:cry|sob)$/.test(part.event) ? "[crying]" : part.cue;
        if (roleplay && part.kind === "narration") return "";
        return part.kind === "narration" && !/[.!?…]$/.test(part.text) ? part.text + "." : part.text;
      })
      .filter(Boolean)
      .join(" ");
    if (text || reactions.length) {
      runs.push({ text, segments: parts, reactions, performance: "neutral" });
    }
    parts = [];
    delivery = null;
  };
  for (const part of score.segments) {
    if (part.kind === "reaction") {
      add();
      parts.push(part);
      if (!/^(?:cry|sob)$/.test(part.event) || separate.has(part.event)) add();
    } else {
      if (part.kind === "dialogue" && delivery !== null && delivery !== part.performance) {
        // Carry the new gesture with its own dialogue instead of applying the last mood to every line.
        const leadingActions = [];
        while (parts.at(-1)?.kind === "narration") leadingActions.unshift(parts.pop());
        add();
        parts.push(...leadingActions);
      }
      parts.push(part);
      if (part.kind === "dialogue") delivery = part.performance;
    }
  }
  add();
  return runs;
}

export function expressiveDirection(score) {
  if (!score?.segments?.length) return "";
  const directions = score.segments.map((part, index) => part.kind === "reaction"
    ? `${index + 1}. Vocal reaction: ${part.direction}`
    : `${index + 1}. ${part.kind === "narration" ? "Narration" : "Dialogue"}: read its exact words once, with ${part.performance} delivery.`);
  return "Perform the following ordered score in the same speaker's voice. Bracketed vocal cues are actual nonverbal sounds, never words or descriptions to read aloud. Do not say the sound names, stage directions, or these instructions. Each reaction happens only at its marked position. Preserve every narration and dialogue word in order. Do not replace dialogue with invented interjections. The segment instructions override any overall mood. After laughter, stop laughing and speak normally; never sustain laughter under dialogue. After a shouted reaction, return to ordinary narration; do not shout the entire passage. A smile changes tone but creates no laugh. Do not invent accents, slang, music or sound effects from a cultural or regional setting.\n" + directions.join("\n");
}