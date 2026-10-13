import { describe, it, expect, vi } from "vitest";
import { storyContext, resolveStoryTurns, loadStoryContext, continuityRules, deriveStoryFacts, relevantStoryFacts, factsContradicted } from "./storyContext.mjs";

const turn = (id: string, content: string, role = "user") => ({ id, content, role });
const storyId = "889f89f4-8652-4c77-a552-9d5508a67822";
function db(data: any, error: any = null) {
  const query: any = { select: vi.fn(() => query), eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data, error })) };
  return { from: vi.fn(() => query), query };
}

describe("canonical story context", () => {
  it("retrieves a middle fact after more than 48 turns instead of trusting the client window", async () => {
    const messages = Array.from({ length: 102 }, (_, i) => turn(String(i), "Observamos el cuadro " + i));
    messages[24].content = "Clara dejó la brújula violeta en el cajón verde.";
    messages.push(turn("current", "¿Dónde dejó Clara la brújula violeta?"));
    const client = db({ id: "session", messages });
    const context = await loadStoryContext(client, "owner", {
      story: { id: storyId }, history: messages.slice(-49, -1), currentMessageId: "current",
      userMessage: messages.at(-1)!.content,
    });
    expect(context.totalTurns).toBe(102);
    expect(context.memory.some((m: any) => m.content.includes("cajón verde"))).toBe(true);
    expect(context.history.some((m: any) => m.id === "current")).toBe(false);
    expect(client.query.eq.mock.calls).toEqual([["user_id", "owner"], ["story_id", storyId]]);
  });

  it("keeps repeated user actions with distinct IDs and removes only the current turn", () => {
    const messages = [turn("1", "Sí."), turn("2", "Sí."), turn("3", "Sí.")];
    expect(resolveStoryTurns(messages, messages.slice(0, 2), "3").map((m: any) => m.id)).toEqual(["1", "2"]);
  });

  it("merges transient legacy call turns after their persisted overlapping history", () => {
    const saved = [turn("1", "Abro la carta."), turn("2", "Veo una firma.", "assistant")];
    const supplied = [{ role: "assistant", content: "Veo una firma." }, { role: "user", content: "¿La reconoces?" }];
    expect(resolveStoryTurns(saved, supplied).map((m: any) => m.content)).toEqual(["Abro la carta.", "Veo una firma.", "¿La reconoces?"]);
  });

  it("preserves the end of a long recent action", () => {
    const content = "Examino los marcos del museo. ".repeat(90) + "Ya salimos al jardín y Clara abrió el sobre.";
    expect(storyContext([turn("1", content)], "¿Qué hay dentro?").history[0].content).toBe(content);
  });

  it("recalls a long older message's final factual detail", () => {
    const content = "Recorremos las salas del museo. ".repeat(120) + "La brújula violeta quedó en el cajón verde.";
    const history = [turn("1", content), ...Array.from({length: 60}, (_, i) => turn(String(i + 2), "Miramos el cuadro " + i))];
    expect(storyContext(history, "¿Dónde quedó la brújula violeta?").memory.some((m: any) => m.content.includes("cajón verde"))).toBe(true);
  });

  it("keeps corrections in chronological order with their actual speakers", () => {
    const history = [turn("1", "La llave está bajo la maceta."), turn("2", "La llave está en la mesa.", "assistant"),
      turn("3", "Corrijo eso: moví la llave al cajón verde."), ...Array.from({length: 60}, (_, i) => turn(String(i + 4), "Miramos las pinturas."))];
    const memory = storyContext(history, "¿Dónde está la llave?").memory;
    expect(memory.find((m: any) => m.content.includes("Corrijo"))?.role).toBe("user");
    expect(memory.findIndex((m: any) => m.content.includes("Corrijo"))).toBeGreaterThan(memory.findIndex((m: any) => m.content.includes("maceta")));
    expect(continuityRules()).toContain("prevalece su corrección más reciente");
  });

  it("fails explicitly when storage is unavailable, instead of answering without memory", async () => {
    const client = db(null, { message: "offline" });
    await expect(loadStoryContext(client, "owner", { story: { id: storyId }, history: [turn("1", "Invented")] }))
      .rejects.toMatchObject({ code: "memory_unavailable", status: 503 });
  });

  it("rejects an old request after the conversation was deleted or replaced", async () => {
    await expect(loadStoryContext(db(null), "owner", { story: { id: storyId }, sessionId: "old" }))
      .rejects.toMatchObject({ code: "session_conflict" });
    await expect(loadStoryContext(db({ id: "new", messages: [] }), "owner", { story: { id: storyId }, sessionId: "old" }))
      .rejects.toMatchObject({ code: "session_conflict" });
  });

  it("requires the current turn to have been persisted before inference", async () => {
    await expect(loadStoryContext(db({ id: "same", messages: [] }), "owner", {
      story: { id: storyId }, currentMessageId: "unsaved",
    })).rejects.toMatchObject({ code: "session_conflict" });
  });
});


describe("grounded facts and latest actions", () => {
  it("does not turn a negated or hypothetical location into current state", () => {
    const facts = deriveStoryFacts([turn("1", "La llave azul está en el cajón verde."),
      turn("2", "No dejé la llave azul sobre la mesa."), turn("3", "Si moví la llave azul al armario, ¿qué cambiaría?")]);
    expect(facts.find((f: any) => f.kind === "location")?.value).toBe("en el cajón verde");
  });
  it("answers about an earlier event using its historical evidence rather than a later broad location", () => {
    const history = [turn("1", "Al llegar a la cabaña Clara dejó la carta bajo la maceta."),
      turn("2", "Ahora estamos en la estación. La carta quedó en la cabaña.")];
    expect(relevantStoryFacts(history, "¿Dónde dejaste la carta al llegar a la cabaña?")[0].value).toBe("bajo la maceta");
    expect(relevantStoryFacts(history, "¿Dónde está ahora la carta?")[0].value).toBe("en la cabaña");
  });
  it("remembers who signed a document even when that fact follows in another sentence", () => {
    const context = storyContext([turn("1", "Encontré una carta dentro del baúl. Está firmada por Mara.")], "¿Quién firmó la carta?");
    expect(context.facts.find((f: any) => f.kind === "signature")?.value).toBe("Mara");
    expect(factsContradicted("La firmó Clara.", context.facts, "¿Quién firmó la carta?")).toBe(true);
  });
  it("records the latest completed opening and subsequent closing without moving actors", () => {
    expect(deriveStoryFacts([], "Clara abrió una caja: dentro hay una brújula.")[0]).toMatchObject({kind: "prop_state", value: "open", object: "una caja"});
    const facts = deriveStoryFacts([turn("1", "Clara abrió la caja."), turn("2", "Alex cerró la caja.")]);
    expect(facts.find((f: any) => f.kind === "prop_state")?.value).toBe("closed");
  });
  it("does not duplicate legacy call history when its current user turn is already persisted", () => {
    const saved = [turn("1", "Abro el libro."), turn("2", "Veo una firma.", "assistant"), turn("3", "¿Quién firmó?")];
    const history = saved.slice(0, 2).map(({role, content}) => ({role, content}));
    expect(resolveStoryTurns(saved, history, undefined, "¿Quién firmó?")).toHaveLength(2);
  });
});


it("blocks adult mode for a minor remembered earlier in the full archive", async () => {
  const messages = [turn("1", "El personaje tiene 17 años."), ...Array.from({length: 100}, (_, i) => turn(String(i+2), "Conversamos en la biblioteca."))];
  await expect(loadStoryContext(db({id:"s", messages}), "owner", {story:{id:storyId}, userMessage:"Continuemos.", adultMode:true}))
    .rejects.toMatchObject({code:"content_blocked", status:422});
  const safe = await loadStoryContext(db({id:"s", messages}), "owner", {story:{id:storyId}, userMessage:"¿Qué libro estudias?", adultMode:false});
  expect(safe.containsMinor).toBe(true);
});
