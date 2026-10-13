import { describe, it, expect, vi } from "vitest";
import { createStorySessionStore } from "./storySession.mjs";

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
}
const message = (id: string) => ({ id, role: "user", content: "Acción " + id, timestamp: new Date("2026-10-13T21:00:00Z") });
function client(initial: any = null) {
  let row = initial;
  const calls: any[] = [];
  const query: any = { select: vi.fn(() => query), eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
    delete: vi.fn(() => { row = null; return query; }) };
  const api: any = {
    from: vi.fn(() => query), query, calls, fail: false,
    rpc: vi.fn(async (_name: string, args: any) => {
      calls.push(args);
      if (api.fail) return { data: null, error: new Error("offline") };
      row = { id: row?.id || "session", updated_at: "revision-" + calls.length,
        memory_revision: calls.length, messages: [...(row?.messages || []), ...args.p_messages],
        narrative: args.p_narrative, last_mode: args.p_mode };
      return { data: row, error: null };
    }),
  };
  return api;
}

describe("acknowledged persistent sessions", () => {
  it("serializes saves and sends only new immutable messages with the acknowledged revision", async () => {
    const api = client(), store = createStorySessionStore(api, "user", "story", storage());
    await store.load();
    await Promise.all([store.save([message("1")], null, "roleplay"),
      store.save([message("1"), message("2")], null, "roleplay")]);
    expect(api.calls[1].p_messages.map((m: any) => m.id)).toEqual(["2"]);
    expect(api.calls[1].p_expected_revision).toBe(1);
    expect(store.current().messages.map((m: any) => m.id)).toEqual(["1", "2"]);
  });

  it("recovers a failed acknowledged write after a new store loads, as after a reload", async () => {
    const cache = storage(), api = client();
    const first = createStorySessionStore(api, "user", "story", cache);
    await first.load();
    api.fail = true;
    await expect(first.save([message("1")], null, "roleplay")).rejects.toThrow("offline");
    first.close();
    api.fail = false;
    const restored = await createStorySessionStore(api, "user", "story", cache).load();
    expect(restored.messages[0].content).toBe("Acción 1");
    expect(cache.getItem("insomnia-session-draft:user:story")).toBeNull();
  });

  it("does not recover a pending draft after that conversation was deleted", async () => {
    const cache = storage();
    cache.setItem("insomnia-session-draft:user:story", JSON.stringify({
      p_story_id: "story", p_session_id: "deleted", p_expected_revision: 1, p_messages: [message("1")],
    }));
    const api = client();
    expect(await createStorySessionStore(api, "user", "story", cache).load()).toBeNull();
    expect(api.rpc).not.toHaveBeenCalled();
    expect(cache.getItem("insomnia-session-draft:user:story")).toBeNull();
  });

  it("clears a first-write draft when the server confirms its session was deleted", async () => {
    const cache = storage(), api = client();
    cache.setItem("insomnia-session-draft:user:story", JSON.stringify({
      p_story_id: "story", p_session_id: "first-write", p_expected_revision: null, p_messages: [message("1")],
    }));
    api.rpc.mockResolvedValue({data: null, error: new Error("session_deleted")});
    expect(await createStorySessionStore(api, "user", "story", cache).load()).toBeNull();
    expect(cache.getItem("insomnia-session-draft:user:story")).toBeNull();
  });

  it("does not mix another user's or story's pending turn", async () => {
    const cache = storage(), api = client();
    cache.setItem("insomnia-session-draft:other:story", JSON.stringify({ p_story_id: "story", p_messages: [message("1")] }));
    await createStorySessionStore(api, "user", "story", cache).load();
    await createStorySessionStore(api, "other", "other-story", cache).load();
    expect(api.rpc).not.toHaveBeenCalled();
  });

  it("refuses to alter an already saved message or save before restoration", async () => {
    const api = client({ id: "s", messages: [message("1")] });
    const store = createStorySessionStore(api, "user", "story", storage());
    await expect(store.save([message("2")], null, "roleplay")).rejects.toThrow("session_not_loaded");
    await store.load();
    await expect(store.save([{ ...message("1"), content: "Changed" }], null, "roleplay"))
      .rejects.toMatchObject({ code: "session_conflict" });
    expect(api.rpc).not.toHaveBeenCalled();
  });

  it("prevents a closed store from writing into a newly selected conversation", async () => {
    const api = client(), store = createStorySessionStore(api, "user", "story", storage());
    await store.load(); store.close();
    await expect(store.save([message("1")], null, "roleplay")).rejects.toMatchObject({code: "session_conflict"});
    expect(api.rpc).not.toHaveBeenCalled();
  });

  it("propagates load errors rather than initializing empty state", async () => {
    const api = client();
    api.query.maybeSingle.mockResolvedValue({data: null, error: new Error("unavailable")});
    await expect(createStorySessionStore(api, "user", "story", storage()).load()).rejects.toThrow("unavailable");
  });
});


it("recovers the latest server history after a tab conflict and keeps only the user's unsent input", async () => {
  const cache = storage(), api = client({id: "same", messages: [message("1")], memory_revision: 2});
  cache.setItem("insomnia-session-draft:user:story", JSON.stringify({p_story_id: "story", p_session_id: "same", p_expected_revision: 1,
    p_messages: [message("2"), {...message("3"), role: "assistant"}]}));
  api.rpc.mockResolvedValue({data: null, error: new Error("session_conflict")});
  const store = createStorySessionStore(api, "user", "story", cache);
  expect((await store.load()).messages).toHaveLength(1);
  expect(store.pendingInput()).toBe("Acción 2");
  expect(store.recoveredConflict()).toBe(true);
});
