import { beforeEach, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "test-user" } } } }) },
    functions: { invoke },
  },
}));

import { invokeFunctionWithRetry } from "./invokeFunction";

beforeEach(() => {
  invoke.mockReset();
  localStorage.clear();
});

it("routes story-chat directly to ownAi without legacy queue polling", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ content: "Ese video lo envié yo." }), { status: 200 }),
  );
  const result = await invokeFunctionWithRetry<{ content: string }>("story-chat", {
    adultMode: true,
    story: { id: "story-1", title: "Historia" },
    userMessage: "Continúa desde aquí",
  });
  expect(result.error).toBeNull();
  expect(result.data?.content).toBe("Ese video lo envié yo.");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(invoke).not.toHaveBeenCalled();
  fetchMock.mockRestore();
});

it("keeps a scene without adult mode on Gemini", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ content: "Seguimos en la misma escena." }), { status: 200 }),
  );
  const result = await invokeFunctionWithRetry<{ content: string }>("story-chat", {
    adultMode: false,
    story: { title: "Historia" },
    userMessage: "Continúa desde aquí",
  });
  expect(result.error).toBeNull();
  expect(result.data?.content).toBe("Seguimos en la misma escena.");
  expect(invoke).not.toHaveBeenCalled();
  fetchMock.mockRestore();
});

it("rejects candidate reply if it repeats previous assistant turn and returns the retried non-repeated reply", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ content: "Mensaje idéntico anterior." }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ content: "Nueva respuesta fresca y diferente." }), { status: 200 }));
  const result = await invokeFunctionWithRetry<{ content: string }>("story-chat", {
    adultMode: false,
    story: { title: "Historia" },
    history: [{ role: "assistant", content: "Mensaje idéntico anterior." }],
    userMessage: "¿Qué dices?",
  });
  expect(result.error).toBeNull();
  expect(result.data?.content).toBe("Nueva respuesta fresca y diferente.");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  fetchMock.mockRestore();
});
