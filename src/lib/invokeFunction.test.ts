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

it("sends an adult scene to the local model and keeps the job if one status check fails", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch");
  invoke
    .mockResolvedValueOnce({ data: { status: "pending", jobId: "job-1" }, error: null })
    .mockResolvedValueOnce({ data: null, error: new Error("transient status failure") })
    .mockResolvedValueOnce({ data: { status: "completed", content: "Ese video lo envié yo." }, error: null });
  const result = await invokeFunctionWithRetry<{ content: string }>("story-chat", {
    adultMode: true,
    story: { id: "story-1", title: "Historia" },
    userMessage: "Continúa desde aquí",
  });
  expect(result.error).toBeNull();
  expect(result.data?.content).toBe("Ese video lo envié yo.");
  expect(fetchMock).not.toHaveBeenCalled();
  expect(invoke.mock.calls.map(([name, options]) => [name, options.body.action, options.body.adultMode])).toEqual([
    ["adult-story-chat", "create", true],
    ["adult-story-chat", "status", undefined],
    ["adult-story-chat", "status", undefined],
  ]);
  expect(localStorage.getItem("kineva-adult-pending:test-user:story-1")).toBeNull();
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
