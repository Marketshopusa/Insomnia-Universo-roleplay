export type StoryTurn = { role: "user" | "assistant"; content: string };

const common = new Set([
  "para", "pero", "como", "cuando", "donde", "quien", "quiero", "ahora",
  "esto", "esta", "este", "estamos", "tengo", "tiene", "tenia", "dijo",
  "dice", "sobre", "porque", "recuerdas", "hablamos", "entonces", "despues",
  "algo", "aqui", "alli", "the", "with", "that", "what", "where",
]);
const terms = (value: string) => new Set(
  (value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .match(/[a-zñ0-9]{4,}/g) || []).filter((word) => !common.has(word))
);

/** Recall relevant older turns without another model call or cross-story state. */
export function selectStoryMemory(
  history: StoryTurn[], latest: string, recentCount = 48,
): StoryTurn[] {
  const older = history.slice(0, Math.max(0, history.length - recentCount));
  if (!older.length) return [];
  const query = terms(latest);
  const chosen = new Set<number>(older.slice(0, 2).map((_, index) => index));
  const ranked = older.map((turn, index) => {
    const overlap = [...terms(turn.content)].filter((word) => query.has(word)).length;
    return { index, overlap };
  }).filter(({ index, overlap }) => index >= 2 && overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || b.index - a.index);
  for (const item of ranked.slice(0, 4)) chosen.add(item.index);
  if (chosen.size <= 2) {
    for (let index = Math.max(2, older.length - 2); index < older.length; index++) chosen.add(index);
  }
  return [...chosen].sort((a, b) => a - b).slice(0, 6)
    .map((index) => ({
      role: older[index].role,
      content: older[index].content.slice(0, 160),
    }));
}
