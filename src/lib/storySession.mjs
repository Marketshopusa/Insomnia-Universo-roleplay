/** One store per authenticated user/story. Server acknowledgements define saved state. */
export function createStorySessionStore(client, userId, storyId, storage = null) {
  if (!storage) { try { storage = globalThis.localStorage; } catch { /* unavailable */ } }
  const key = "insomnia-session-draft:" + userId + ":" + storyId;
  const draftRead = () => { try { return storage?.getItem(key); } catch { return null; } };
  const draftWrite = (raw) => { try { storage?.setItem(key, raw); } catch { /* server remains authoritative */ } };
  const draftClear = (raw) => { try { if (!raw || draftRead() === raw) storage?.removeItem(key); } catch { /* ignore */ } };
  let saved = null;
  let newSessionId = null;
  let loaded = false;
  let closed = false;
  let queue = Promise.resolve();
  let recoveryConflict = false;
  const conflict = () => Object.assign(new Error("session_conflict"), { code: "session_conflict" });
  const check = () => { if (closed) throw conflict(); };
  return {
    async load() {
      check();
      const { data, error } = await client.from("story_sessions").select("*")
        .eq("user_id", userId).eq("story_id", storyId).maybeSingle();
      if (error) throw error;
      check();
      saved = data;
      newSessionId = data?.id || globalThis.crypto.randomUUID();
      loaded = true;
      const raw = draftRead();
      if (raw) {
        let args;
        try { args = JSON.parse(raw); } catch { draftClear(raw); }
        if (args?.p_story_id === storyId) {
          // Deleting or replacing the conversation invalidates pending writes.
          if ((saved && args.p_session_id !== saved.id)
            || (!saved && args.p_expected_revision != null)) draftClear(raw);
          else {
            const { data: restored, error: restoreError } = await client.rpc("save_story_session", args);
            if (restoreError && !/session_deleted|session_conflict/.test(String(restoreError.message))) throw restoreError;
            recoveryConflict = !!restoreError && String(restoreError.message).includes("session_conflict");
            check();
            if (!restoreError) { saved = restored; newSessionId = restored.id; }
            if (!recoveryConflict) draftClear(raw);
          }
        }
      }
      return saved;
    },
    save(messages, narrative, mode) {
      const snapshot = messages.filter((m) => m.id !== "intro").map((m) => ({
        id: m.id, role: m.role, content: m.content,
        timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
      }));
      const task = queue.catch(() => {}).then(async () => {
        check();
        if (!loaded) throw new Error("session_not_loaded");
        const known = new Map((saved?.messages || []).map((m) => [m.id, m]));
        const additions = snapshot.filter((m) => !known.has(m.id));
        for (const m of snapshot) {
          const old = known.get(m.id);
          if (old && (old.content !== m.content || old.role !== m.role)) throw conflict();
        }
        const args = {
          p_story_id: storyId, p_session_id: saved?.id || newSessionId,
          p_expected_updated_at: saved?.updated_at || null, p_expected_revision: saved?.memory_revision ?? null, p_messages: additions,
          p_narrative: narrative, p_mode: mode,
        };
        const raw = JSON.stringify(args);
        draftWrite(raw);
        const { data, error } = await client.rpc("save_story_session", args);
        if (error) throw error;
        check();
        saved = data;
        draftClear(raw);
        return data;
      });
      queue = task;
      return task;
    },
    async remove() {
      await queue.catch(() => {});
      check();
      if (saved) {
        const { data, error } = await client.from("story_sessions").delete()
          .eq("user_id", userId).eq("story_id", storyId).eq("id", saved.id)
          .eq("updated_at", saved.updated_at).eq("memory_revision", saved.memory_revision).select("id");
        if (error) throw error;
        if (!data?.length) throw conflict();
      }
      saved = null;
      newSessionId = globalThis.crypto.randomUUID();
      loaded = true;
      draftClear();
    },
    close() { closed = true; },
    pendingInput() {
      if (!recoveryConflict) return "";
      try { return JSON.parse(draftRead() || "{}").p_messages?.filter((m) => m.role === "user" && !(saved?.messages || []).some((old) => old.id === m.id)).at(-1)?.content || ""; } catch { return ""; }
    },
    recoveredConflict() { return recoveryConflict; },
    current() { return saved; },
  };
}
