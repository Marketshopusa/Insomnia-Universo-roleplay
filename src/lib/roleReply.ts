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
    if (stripped) return stripped;
  }

  return unfenced;
}
