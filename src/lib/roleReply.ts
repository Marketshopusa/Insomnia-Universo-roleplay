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

