/** Keep internal structured output out of the visible story and its audio. */
export function normalizeAssistantReply(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const original = value.trim();
  if (!original) return null;
  const unfenced = original.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  // 1. Incomplete truncated JSON prompt leaks (e.g. `{"gesto":"Abro el libro","dialogo":`)
  if (/^\{\s*["']?(?:gesto|gestos|dialogo|dialogue)["']?\s*:.*?(?:["']?(?:dialogo|dialogue)["']?\s*:\s*)?$/i.test(unfenced) && !unfenced.endsWith("}")) {
    const trailingContent = unfenced.replace(/^.*?["']?(?:dialogo|dialogue)["']?\s*:\s*/i, "").trim();
    if (!trailingContent || trailingContent === '"' || trailingContent === "'") {
      return null;
    }
  }

  // 2. Try parsing valid JSON
  try {
    const jsonMatch = unfenced.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { gesto?: unknown; gestos?: unknown; dialogo?: unknown; dialogue?: unknown };
      const dialogue = parsed.dialogo ?? parsed.dialogue;
      const gesture = parsed.gesto ?? parsed.gestos;
      const spoken = typeof dialogue === "string" ? dialogue.trim().replace(/^["“«']|["”»']$/g, "") : "";
      const action = typeof gesture === "string" ? gesture.trim().replace(/^\*|\*$/g, "") : "";
      if (spoken || action) {
        return action ? `*${action}*${spoken ? ` ${spoken}` : ""}` : spoken;
      }
    }
  } catch {
    // Continue to pseudo-JSON recovery
  }

  // 3. Try pseudo-JSON with backticks or plain tags: `gesto`: "..." `dialogo`: "..."
  const pseudoMatch = unfenced.match(/(?:[`"']?(?:gesto|gestos)[`"']?\s*:\s*["“«']?([\s\S]*?)["”»']?\s*)?[`"']?(?:di[aá]logo|dialogue)[`"']?\s*:\s*["“«']?([\s\S]*?)["”»']?$/i);
  if (pseudoMatch && (pseudoMatch[1] || pseudoMatch[2])) {
    const action = (pseudoMatch[1] || "").trim().replace(/^\*|\*$/g, "").replace(/^[`"']|[`"']$/g, "");
    const spoken = (pseudoMatch[2] || "").trim().replace(/^["“«']|["”»']$/g, "");
    if (spoken || action) {
      return action ? `*${action}*${spoken ? ` ${spoken}` : ""}` : spoken;
    }
  }

  // 4. If any stray labels exist, strip them completely
  if (/(?:[`"']?(?:gesto|gestos|di[aá]logo|dialogue)[`"']?\s*:)/i.test(unfenced)) {
    const stripped = unfenced
      .replace(/[`"']?(?:gesto|gestos|di[aá]logo|dialogue)[`"']?\s*:\s*/gi, " ")
      .replace(/^["“«']|["”»']$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (stripped) return compactRoleplayReply(stripped);
  }

  return compactRoleplayReply(unfenced);
}

const DANGLING_TAIL = /\b(?:de|del|al|a|en|con|por|para|sin|sobre|entre|hacia|hasta|como|mientras|cuando|que|y|e|o|u|ni|pero|un|una|unos|unas|el|la|los|las|su|sus|mi|mis|tu|tus|me|te|se|nos|le|les|lo)\s*$/iu;

function trimActionCue(rawAction: string): string {
  const firstSentence = rawAction
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…])\s+/)[0]
    .replace(/[.!?…]+$/, "")
    .trim();
  const words = firstSentence.split(/\s+/).filter(Boolean);
  if (words.length <= 7) return firstSentence;
  // Prefer cutting at a comma if the first clause is 2..7 words
  const commaClause = firstSentence.split(",")[0].trim();
  const commaWords = commaClause.split(/\s+/).filter(Boolean);
  let sliced = commaWords.length >= 2 && commaWords.length <= 7
    ? commaWords.join(" ")
    : words.slice(0, 6).join(" ");
  while (DANGLING_TAIL.test(sliced) && sliced.includes(" ")) {
    sliced = sliced.replace(/\s+\S+$/, "").trim();
  }
  return sliced.replace(/[,;:\s]+$/, "").trim();
}

/**
 * Enforces:
 * 1. No unclosed asterisks or mid-sentence cutoffs at the end of a reply.
 * 2. Strictly ~20% action (*...*) / ~80% spoken dialogue (actions capped to brief cues).
 * 3. Compact length (-50% reduction, max ~380 chars / ~65 words) so replies are fast and engaging.
 */
export function compactRoleplayReply(input: string): string {
  let text = String(input || "").trim();
  if (!text) return "";

  // 1. Remove any trailing unclosed *action fragment (e.g. "... increíble, Tío. *Murmura entre jade")
  const asteriskCount = (text.replace(/\*\*/g, "").match(/\*/g) || []).length;
  if (asteriskCount % 2 === 1) {
    const lastStar = text.lastIndexOf("*");
    const beforeStar = text.slice(0, lastStar).trim();
    if (beforeStar.length >= 15) {
      text = beforeStar;
    } else {
      text = text + "*";
    }
  }

  // 2. If text was cut off mid-sentence at max_tokens, trim back to the last complete sentence
  if (text.length > 80 && !/[.!?…"”»*)\]]$/.test(text)) {
    const lastPunct = Math.max(
      text.lastIndexOf("."),
      text.lastIndexOf("!"),
      text.lastIndexOf("?"),
      text.lastIndexOf("…"),
      text.lastIndexOf("*"),
    );
    if (lastPunct >= 25) {
      text = text.slice(0, lastPunct + 1).trim();
    }
  }

  // 3. Shorten bloated *action* blocks to brief 2-6 word cues and keep at most 2 action cues total
  let actionCount = 0;
  text = text.replace(/\*([^*\n]+)\*/g, (_match, inner: string) => {
    actionCount += 1;
    if (actionCount > 2) return "";
    const shortCue = trimActionCue(inner);
    return shortCue ? `*${shortCue}*` : "";
  });

  // 4. Collapse whitespace and cap total length to ~380 chars at a clean sentence boundary
  text = text.replace(/[ \t]{2,}/g, " ").replace(/\n{2,}/g, "\n").trim();
  if (text.length > 380) {
    const sentences = text.match(/[^.!?…]+[.!?…]+["'»”*)]*(?:\s+|$)/gu);
    if (sentences && sentences.length > 1) {
      let acc = "";
      for (const s of sentences) {
        if ((acc + s).length > 380 && acc.length >= 80) break;
        acc += s;
      }
      if (acc.trim()) text = acc.trim();
    }
  }

  // Ensure balanced asterisks after any slicing
  if (((text.replace(/\*\*/g, "").match(/\*/g) || []).length) % 2 === 1) {
    text = text.replace(/\*[^*]*$/, "").trim();
  }

  return text;
}

const NON_NAME_WORDS = new Set([
  "abre", "abrio", "abrió", "entra", "entro", "entró", "llega", "llego", "llegó", "dice", "dijo",
  "me", "te", "se", "nos", "le", "les", "lo", "la", "el", "los", "las", "un", "una", "unos", "unas",
  "mi", "mis", "tu", "tus", "su", "sus", "que", "quien", "como", "cuando", "donde", "mientras", "pero",
  "sin", "con", "por", "para", "sobre", "entre", "hacia", "hasta", "desde", "en", "de", "del", "al",
  "y", "e", "o", "u", "ni", "no", "si", "sí", "ya", "muy", "mas", "más", "tan", "tanto", "toda", "todo",
  "mayor", "menor", "pequeña", "grande", "hermosa", "bella", "linda", "caliente", "desnuda", "vestida",
  "viene", "vino", "sale", "salió", "va", "fue", "era", "es", "son", "está", "esta", "estaba", "tiene",
  "hace", "hizo", "ve", "vio", "mira", "miró", "besa", "besó", "abraza", "abrazó", "toca", "tocó",
  "salta", "saltó", "camina", "corre", "grita", "gime", "llora", "ríe", "sonríe", "pregunta", "responde",
  "cierra", "cerró", "pide", "pidió", "quiere", "quería", "puede", "pudo", "sabe", "sabía", "allí", "alli", "aquí", "aqui",
]);

export interface ActiveCharacterInfo {
  isSwitched: boolean;
  name: string;
  role: string;
  fullLabel: string;
  addressTerm: string;
  defaultFirstName: string;
  playerFirstName: string;
}

function capitalizeWord(word: string): string {
  if (!word) return "";
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function resolveActiveCharacter(
  userMessage: string,
  history: { role: string; content?: string; text?: string }[] = [],
  defaultCharacterRole = "Personaje",
  playerRole = "Usuario",
): ActiveCharacterInfo {
  const defaultFirstName = (defaultCharacterRole.match(/[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}/)?.[0] || defaultCharacterRole.split(/[\s,()]+/)[0] || "Personaje").trim();
  const playerFirstName = (playerRole.match(/[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}/)?.[0] || playerRole.split(/[\s,()]+/)[0] || "Usuario").trim();
  const defaultIsSobrina = /sobrin/i.test(defaultCharacterRole) || /t[ií][oa]/i.test(playerRole);

  const knownByName = new Map<string, { name: string; role: string; addressTerm: string }>();

  const parseLine = (line: string): { isDefault: boolean; name: string; role: string; addressTerm: string } | null => {
    const text = String(line || "").trim();
    if (!text) return null;

    // Check "Nombre, mi hermana" pattern first
    const preNamed = text.match(/\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,15})\s*,?\s*(?:mi|su|la)\s+(hermana|hermanita|prima|primita|cuñada|mam[aá]|madre|t[ií]a|vecina|amiga|sobrina)\b/i);
    const kinMatches = [...text.matchAll(/\b((?:su|la|mi)\s+mam[aá]|(?:su|la|mi)\s+madre|mam[aá]|madre|herman[ao]|hermanit[ao]|prim[ao]|primit[ao]|cuñad[ao]|t[ií][ao]|sobrin[ao]|vecin[ao]|amig[ao]|suegr[ao]|esposa|novia|jefa|secretaria|profesora|enfermera|doctora)(?:\s+(?:llamad[ao]\s+)?([A-ZÁÉÍÓÚÑa-záéíóúñ]{3,15}))?\b/gi)];

    let rawKin = "";
    let candidateName = "";

    if (preNamed) {
      candidateName = capitalizeWord(preNamed[1]);
      rawKin = preNamed[2].toLowerCase();
    } else if (kinMatches.length > 0) {
      const last = kinMatches[kinMatches.length - 1];
      rawKin = (last[1] || "").toLowerCase().trim();
      const afterWord = (last[2] || "").trim();
      if (afterWord && !NON_NAME_WORDS.has(afterWord.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")) && !NON_NAME_WORDS.has(afterWord.toLowerCase())) {
        candidateName = capitalizeWord(afterWord);
      }
    }

    if (rawKin) {
      if (/sobrin/i.test(rawKin) && defaultIsSobrina) {
        return { isDefault: true, name: defaultFirstName, role: "sobrina", addressTerm: "Tío" };
      }
      let role = "personaje";
      let addressTerm = playerFirstName;
      if (/herman/i.test(rawKin) || ((/su\s+mam|su\s+madre|la\s+mam|la\s+madre/i.test(rawKin) || (/^(?:mam[aá]|madre)$/i.test(rawKin) && defaultIsSobrina)) && !/mi\s+mam|mi\s+madre/i.test(rawKin))) {
        role = `la hermana de ${playerFirstName}`;
        addressTerm = "hermano";
      } else if (/mam[aá]|madre/i.test(rawKin)) {
        role = `la mamá de ${playerFirstName}`;
        addressTerm = "hijo";
      } else if (/prim/i.test(rawKin)) {
        role = `la prima de ${playerFirstName}`;
        addressTerm = "primo";
      } else if (/cuñad/i.test(rawKin)) {
        role = `la cuñada de ${playerFirstName}`;
        addressTerm = "cuñado";
      } else if (/t[ií]a/i.test(rawKin)) {
        role = `la tía de ${playerFirstName}`;
        addressTerm = "sobrino";
      } else if (/vecin/i.test(rawKin)) {
        role = `la vecina de ${playerFirstName}`;
        addressTerm = "vecino";
      } else if (/amig/i.test(rawKin)) {
        role = `la amiga de ${playerFirstName}`;
        addressTerm = playerFirstName;
      } else if (/suegr/i.test(rawKin)) {
        role = `la suegra de ${playerFirstName}`;
        addressTerm = playerFirstName;
      } else {
        role = rawKin;
        addressTerm = playerFirstName;
      }

      const prevForRole = [...knownByName.values()].find((v) => v.role === role);
      const finalName = candidateName || prevForRole?.name || "";
      const info = { isDefault: false, name: finalName, role, addressTerm };
      if (finalName) knownByName.set(finalName.toLowerCase(), { name: finalName, role, addressTerm });
      return info;
    }

    // Check if user mentioned a known secondary character by name (e.g. "Gabriela")
    for (const [key, val] of knownByName.entries()) {
      if (new RegExp(`\\b${key}\\b`, "i").test(text)) {
        return { isDefault: false, ...val };
      }
    }

    // Check if user explicitly mentioned the default character's name to switch back
    if (defaultFirstName && new RegExp(`\\b${defaultFirstName}\\b`, "i").test(text)) {
      return { isDefault: true, name: defaultFirstName, role: defaultCharacterRole, addressTerm: defaultIsSobrina ? "Tío" : playerFirstName };
    }

    return null;
  };

  let active: { isDefault: boolean; name: string; role: string; addressTerm: string } | null = null;
  for (const turn of history) {
    if (turn.role === "user") {
      const parsed = parseLine(turn.content || turn.text || "");
      if (parsed) active = parsed;
    }
  }
  const latestParsed = parseLine(userMessage);
  if (latestParsed) active = latestParsed;

  if (!active || active.isDefault) {
    return {
      isSwitched: false,
      name: defaultFirstName,
      role: defaultCharacterRole,
      fullLabel: defaultCharacterRole,
      addressTerm: defaultIsSobrina ? "Tío" : playerFirstName,
      defaultFirstName,
      playerFirstName,
    };
  }

  const fullLabel = active.name ? `${active.name} (${active.role})` : active.role;
  return {
    isSwitched: true,
    name: active.name || active.role,
    role: active.role,
    fullLabel,
    addressTerm: active.addressTerm,
    defaultFirstName,
    playerFirstName,
  };
}

export function sanitizeSwitchedReply(reply: string, info: ActiveCharacterInfo): string {
  if (!info.isSwitched || !reply) return reply;
  let cleaned = reply;

  // 1. Remove lines where the niece says "Mami..." or speaks in 3rd person as the old character
  if (info.defaultFirstName && info.defaultFirstName.toLowerCase() !== info.name.toLowerCase()) {
    const escapedDefault = info.defaultFirstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleaned = cleaned.replace(new RegExp(`\\*[^*]*\\b${escapedDefault}\\b[^*]*\\*`, "gi"), "*Me aprieto contra ti*");
    cleaned = cleaned.replace(new RegExp(`\\b${escapedDefault}\\b`, "gi"), info.name);
  }
  cleaned = cleaned.replace(/(?:^|\n)\s*Mami\b[^.!?\n]*[.!?]+\s*/gi, " ");
  cleaned = cleaned.replace(/\bMami\b[,…]?\s*/gi, "");

  // 2. Replace "Tío" / "tío" with the correct relationship address term (e.g. "hermano")
  if (info.addressTerm.toLowerCase() !== "tío" && info.addressTerm.toLowerCase() !== "tio") {
    cleaned = cleaned.replace(/\bTío\b/g, info.addressTerm);
    cleaned = cleaned.replace(/\btío\b/g, info.addressTerm.toLowerCase());
  }

  return compactRoleplayReply(cleaned);
}


