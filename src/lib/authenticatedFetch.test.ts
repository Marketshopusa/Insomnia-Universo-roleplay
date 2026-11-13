import { afterEach, beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
import { authenticatedFetch } from "./authenticatedFetch";
const session = (access_token: string | null) => ({ data: { session: access_token ? { access_token } : null }, error: null });
beforeEach(() => { auth.getSession.mockReset().mockResolvedValue(session("old-token")); auth.refreshSession.mockReset().mockResolvedValue(session("new-token")); });
afterEach(() => vi.restoreAllMocks());

it.each(["/api/ai", "/api/speech"])("renews a rejected token once for %s and replays the same request", async (url) => {
  const fetchMock = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ error: "login_required" }, { status: 401 }))
    .mockResolvedValueOnce(Response.json({ text: "Hola" }));
  const response = await authenticatedFetch(url, { method: "POST", body: "original-body" });
  expect(response.status).toBe(200);
  expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer old-token");
  expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get("Authorization")).toBe("Bearer new-token");
  expect(fetchMock.mock.calls[1][1]?.body).toBe("original-body");
});

it("stops after a second rejection rather than looping", async () => {
  const required = vi.fn(); window.addEventListener("insomnia:auth-required", required);
  try {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: "login_required" }, { status: 401 }));
    expect((await authenticatedFetch("/api/ai")).status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(required).toHaveBeenCalledTimes(1);
  } finally { window.removeEventListener("insomnia:auth-required", required); }
});

it("does not send an unauthenticated request when recovery has no session", async () => {
  auth.getSession.mockResolvedValue(session(null)); auth.refreshSession.mockResolvedValue(session(null));
  const fetchMock = vi.spyOn(globalThis, "fetch");
  expect((await authenticatedFetch("/api/ai")).status).toBe(401);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("shares one refresh between simultaneous requests", async () => {
  let finish!: (value: ReturnType<typeof session>) => void;
  auth.refreshSession.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) =>
    Response.json({}, { status: new Headers(init?.headers).get("Authorization") === "Bearer old-token" ? 401 : 200 }));
  const requests = [authenticatedFetch("/api/ai"), authenticatedFetch("/api/speech")];
  await vi.waitFor(() => expect(auth.refreshSession).toHaveBeenCalledTimes(1));
  finish(session("new-token"));
  expect((await Promise.all(requests)).map((r) => r.status)).toEqual([200, 200]);
});

it("does not mark an authentication outage as an expired login", async () => {
  auth.getSession.mockRejectedValue(new TypeError("network unavailable"));
  const response = await authenticatedFetch("/api/ai");
  expect(response.status).toBe(503);
  expect((await response.json()).error).toBe("auth_unavailable");
});
