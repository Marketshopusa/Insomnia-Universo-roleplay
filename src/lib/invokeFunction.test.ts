import { beforeEach, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: { access_token: "test-token", user: { id: "test-user" } } } }) },
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

it("does not run the entire provider chain twice after a terminal AI failure", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ error: "ai_timeout", message: "Turn timed out" }), { status: 504 }),
  );
  const result = await invokeFunctionWithRetry("story-chat", { userMessage: "Hola", story: { id: "a" } });
  expect(result.error?.context.status).toBe(504);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fetchMock.mockRestore();
});

it("does not retry a validation rejection from the server", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ error: "invalid_request" }), { status: 422 }),
  );
  await invokeFunctionWithRetry("story-chat", { userMessage: "Hola", story: { id: "a" } });
  expect(fetchMock).toHaveBeenCalledTimes(1);
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


it.each([
  [422, "content_blocked", "El control de contenido rechazó este turno."],
  [403, "adult_birth_date_required", "Completa tu fecha de nacimiento real en Mi perfil."],
  [503, "magnum_policy_unavailable", "No se pudo comprobar la seguridad de este turno."],
  [504, "ai_timeout", "La IA agotó el tiempo de este turno."],
])("preserves the structured adult-mode error %s/%s for the screen", async (status, code, message) => {
  const payload = { error: code, message };
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(payload), { status }),
  );
  try {
    const result = await invokeFunctionWithRetry("story-chat", {
      adultMode: true, adultConsent: true,
      settings: { modelId: "magnum-v4-local", adultMode: true },
      story: { id: "adult-test-card", character_age: 30 },
      userMessage: "Mensaje de prueba",
    });
    expect(result.data).toEqual(payload);
    expect(result.error?.message).toBe(message);
    expect(result.error?.context.status).toBe(status);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(invoke).not.toHaveBeenCalled();
  } finally { fetchMock.mockRestore(); }
});
