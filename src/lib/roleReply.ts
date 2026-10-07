/** Keep internal structured output out of the visible story and its audio. */
export function normalizeAssistantReply(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const original = value.trim();
  if (!original) return null;
  const unfenced = original.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const structured = original.startsWith("```") || /^\{\s*["']?(?:gesto|gestos|dialogo|dialogue)\b/i.test(unfenced)
    || /^\s*["'](?:gesto|gestos|dialogo|dialogue)["']\s*:/im.test(unfenced);
  if (!structured) return original;
  try {
    const parsed = JSON.parse(unfenced) as { gesto?: unknown; gestos?: unknown; dialogo?: unknown; dialogue?: unknown };
    const dialogue = parsed.dialogo ?? parsed.dialogue;
    const gesture = parsed.gesto ?? parsed.gestos;
    const spoken = typeof dialogue === "string" ? dialogue.trim() : "";
    const action = typeof gesture === "string" ? gesture.trim().replace(/^\*|\*$/g, "") : "";
    if (!spoken && !action) return null;
    return action ? `*${action}*${spoken ? ` ${spoken}` : ""}` : spoken;
  } catch {
    return null;
  }
}
