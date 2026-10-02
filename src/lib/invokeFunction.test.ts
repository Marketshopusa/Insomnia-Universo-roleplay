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

it("asks Gemini for the adult scene instead of the small local model", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ content: "Ese video lo envié yo." }), { status: 200 }),
  );
  const result = await invokeFunctionWithRetry<{ content: string }>("story-chat", {
    adultMode: true,
    story: { title: "Historia" },
    userMessage: "Continúa desde aquí",
  });
  expect(result.error).toBeNull();
  expect(result.data?.content).toBe("Ese video lo envié yo.");
  expect(invoke).not.toHaveBeenCalled();
  const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
  expect(body.action).toBe("story-chat");
  expect(body.body.adultMode).toBe(true);
  fetchMock.mockRestore();
});
