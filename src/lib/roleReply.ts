/** Keep internal structured output out of the visible story and its audio. */
export function normalizeAssistantReply(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const original = value.trim();
  if (!original) return null;
  const unfenced = original.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const structured = original.startsWith("```") || /^\{\s*["']?(?:gesto|dialogo)\b/i.test(unfenced)
    || /^\s*["'](?:gesto|dialogo)["']\s*:/im.test(unfenced);
  if (!structured) return original;
  try {
    const parsed = JSON.parse(unfenced) as { gesto?: unknown; dialogo?: unknown };
    if (typeof parsed.dialogo !== "string" || !parsed.dialogo.trim()) return null;
    const dialogue = parsed.dialogo.trim();
    const gesture = typeof parsed.gesto === "string" ? parsed.gesto.trim().replace(/^\*|\*$/g, "") : "";
    return gesture ? `*${gesture}* ${dialogue}` : dialogue;
  } catch {
    return null;
  }
}
