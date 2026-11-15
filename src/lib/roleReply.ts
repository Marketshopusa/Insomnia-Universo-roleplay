import { isRepeatedTurn } from "./conversationReply.mjs";
const ENGLISH_PATTERNS = [

  /\b(?:again\s+after\s+so\s+long|after\s+so\s+long)\b/i,

  /\b(?:i(?:'ve|'m)?\s+missed\s+you)\b/i,

  /\b(?:so\s+good\s+to\s+see\s+you|good\s+to\s+see\s+you)\b/i,

  /\b(?:i\s+can(?:'t|not)\s+(?:deny|wait|believe))\b/i,

  /\b(?:oh\s+my\s+god|my\s+god)\b/i,

  /\b(?:come\s+on|come\s+here)\b/i,

  /\b(?:you\s+know(?:\s+what)?)\b/i,

  /\b(?:what\s+do\s+you\s+mean|what\s+are\s+you\s+doing)\b/i,

  /\b(?:i\s+love\s+you|love\s+you)\b/i,

  /\b(?:sweetheart|darling|honey)\b/i,

];



export function hasEnglishIntrusion(text: string): boolean {

  if (!text) return false;

  return ENGLISH_PATTERNS.some((pat) => pat.test(text));

}



// Formatting must preserve the generated words; language errors are regenerated, never replaced by stock phrases.
export function cleanLanguageBleed(text: string): string { return String(text || "").trim(); }

/** Keep internal structured output out of the visible story and its audio. */

export type ReplyEngine = { profile?: string; model?: string; provider?: string; fallback?: boolean };

/** Magnum's structured response has already been validated; retain both components in full. */
export function normalizeAssistantResponse(data: { content?: unknown; engine?: ReplyEngine }): string | null {
  if ((data.engine?.profile === "magnum-conversation" || (data.engine?.profile === "magnum-v4-local" && data.engine.model === "magnum-v4-12b" && data.engine.fallback === false)) && typeof data.content === "string") return data.content.trim() || null;
  return normalizeAssistantReply(data.content);
}

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

      const parsed = JSON.parse(jsonMatch[0]) as { gesto?: unknown; gestos?: unknown; narracion?: unknown; reaccion?: unknown; reaction?: unknown; dialogo?: unknown; dialogue?: unknown };

      const dialogue = parsed.dialogo ?? parsed.dialogue;

      const gesture = parsed.gesto ?? parsed.gestos ?? parsed.narracion ?? parsed.reaccion ?? parsed.reaction;

      const spoken = typeof dialogue === "string" ? dialogue.trim().replace(/^["“«']|["”»']$/g, "") : "";

      const action = typeof gesture === "string" ? gesture.trim().replace(/^\*|\*$/g, "") : "";

      if (spoken || action) {

        return action ? `*${action}*${spoken ? ` ${spoken}` : ""}` : spoken;

      }

    }

  } catch {

    // Continue to pseudo-JSON recovery

  }



  if (/^\{\s*["']?(?:gesto|gestos|narracion|reaccion|reaction|dialogo|dialogue)\b/i.test(unfenced)) return null;

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



/** Repair broken delimiters without replacing generated wording or truncating complete actions. */
export function compactRoleplayReply(input: string): string {
  let text = String(input || "").trim();
  const stars = (text.replace(/\*\*/g, "").match(/\*/g) || []).length;
  if (stars % 2 === 1) {
    const before = text.slice(0, text.lastIndexOf("*")).trim();
    text = before || text + "*";
  }
  const dangling = /\b(?:a\s+las?|a\s+los?|en\s+el|en\s+la|con\s+el|con\s+la|de\s+la|de\s+los|de\s+las|porque|aunque|mientras|pero|que|para|con|de|del|al)\s*\.{2,}\s*$/iu;
  if (dangling.test(text)) {
    text = text.replace(dangling, "").trim();
    if (text && !/[.!?*]$/.test(text)) text += ".";
  }
  return text.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export interface ActiveCharacterInfo {

  isSwitched: boolean;

  name: string;

  role: string;

  fullLabel: string;

  addressTerm: string;

  defaultFirstName: string;

  playerFirstName: string;

}



/** Only explicit user direction can change the active speaker. Third-person mentions and assistant claims cannot. */
export function resolveActiveCharacter(
  userMessage: string, history: { role: string; content?: string; text?: string }[] = [],
  defaultCharacterRole = "Personaje", playerRole = "Usuario",
): ActiveCharacterInfo {
  const defaultFirstName = defaultCharacterRole.split(/[\s,(]+/)[0] || "Personaje";
  const playerFirstName = playerRole.split(/[\s,(]+/)[0] || "Usuario";
  let active = defaultCharacterRole;
  for (const line of [...history.filter(m => m.role === "user").map(m => m.content || m.text || ""), userMessage]) {
    if (/\b(?:vuelve|retoma|regresa)\s+(?:a\s+)?(?:tu\s+)?(?:personaje|rol)\s+(?:original|principal)\b|\breturn to (?:the )?(?:original|main) character\b/i.test(line)) active = defaultCharacterRole;
    const match = String(line).match(/(?:^|[.!?]\s*|\n)\s*(?:ahora\s+)?(?:interpreta\s+a|responde\s+como|act[uú]a\s+como|pasa\s+a\s+interpretar\s+a|respond\s+as|play)\s+([^.!?\n]{2,100})/i);
    if (match) active = match[1].trim();
  }
  const isSwitched = active.toLowerCase() !== defaultCharacterRole.toLowerCase();
  return { isSwitched, name: active.split(/[\s,(]+/)[0], role: active, fullLabel: active,
    addressTerm: playerFirstName, defaultFirstName, playerFirstName };
}

export function isRepeatedAssistantReply(
  candidate: string,
  history: { role: string; content?: string; text?: string }[] = [],
  latest = "",
): boolean {
  return isRepeatedTurn(candidate, history, latest);
}

/** Compatibility formatter: never disguise a role mismatch by inventing an action. */
export function sanitizeSwitchedReply(reply: string, _info: ActiveCharacterInfo): string {
  return String(reply || "").trim();
}
/** Preserve subjects and actions as generated; do not change a third person's action into the character's. */
export function enforceFirstPersonNarrative(text: string, _characterName?: string): string { return String(text || ""); }
/** Never manufacture sounds or replace spoken dialogue with fixed text. */
export function cleanOralOrSilenceDialogue(text: string, _isOralOrSilence: boolean): string { return String(text || ""); }
