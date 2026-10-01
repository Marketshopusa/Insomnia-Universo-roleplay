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

it("keeps the same chat job when one status request fails and then recovers", async () => {
  invoke
    .mockResolvedValueOnce({ data: { status: "pending", jobId: "job-1" }, error: null })
    .mockResolvedValueOnce({ data: null, error: new Error("transient status failure") })
    .mockResolvedValueOnce({ data: { status: "completed", content: "Una respuesta nueva." }, error: null });
  const result = await invokeFunctionWithRetry<{ content: string }>("story-chat", {
    adultMode: true,
    story: { title: "Historia" },
    userMessage: "ContinÃºa desde aquÃ­",
  });
  expect(result.error).toBeNull();
  expect(result.data?.content).toBe("Una respuesta nueva.");
  expect(invoke.mock.calls.map(([name, options]) => [name, options.body.action])).toEqual([
    ["adult-story-chat", "create"],
    ["adult-story-chat", "status"],
    ["adult-story-chat", "status"],
  ]);
  expect(localStorage.getItem("kineva-adult-pending:test-user")).toBeNull();
});
