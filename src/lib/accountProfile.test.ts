import { expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {} } }));
import { profileHref, safeInternalPath, saveAccountProfile } from "./accountProfile";
import { assertAdultAccess } from "../../api/_adultAccess.mjs";
const user = { id: "test-owner", email: "profile@example.invalid", user_metadata: { username: "Anterior", unrelated: "keep" } };
function adapter() {
  let stored = user as { id: string; email: string; user_metadata: Record<string, unknown> };
  const auth = {
    getUser: vi.fn(async () => ({ data: { user: stored }, error: null })),
    updateUser: vi.fn(async ({data}: { data: Record<string, string> }) => {
      stored = { ...stored, user_metadata: { ...stored.user_metadata, ...data } };
      return { data: { user: stored }, error: null };
    }),
  };
  return { auth, getStored: () => stored };
}
it("saves the actual birth_date field read by the backend and preserves unrelated metadata", async () => {
  const {auth, getStored} = adapter();
  await saveAccountProfile({ username: "  Cuenta de prueba  ", birthDate: "1990-06-15" }, user.id, { auth });
  expect(auth.updateUser).toHaveBeenCalledWith({ data: { username: "Cuenta de prueba", birth_date: "1990-06-15" } });
  expect(getStored().user_metadata.unrelated).toBe("keep");
  expect(() => assertAdultAccess(getStored(), true)).not.toThrow();
});
it.each(["", "2099-01-01", "2026-02-30", "not-a-date"])("does not write an invalid birth date: %s", async birthDate => {
  const {auth} = adapter();
  await expect(saveAccountProfile({ username: "Cuenta", birthDate }, user.id, {auth})).rejects.toMatchObject({ code: "invalid_birth_date" });
  expect(auth.updateUser).not.toHaveBeenCalled();
});
it("never turns an underage birth date into eighteen or grants eligibility flags", async () => {
  const {auth, getStored} = adapter();
  await saveAccountProfile({ username: "Cuenta", birthDate: "2015-01-01" }, user.id, {auth});
  expect(getStored().user_metadata.birth_date).toBe("2015-01-01");
  expect(getStored().user_metadata.is_adult).toBeUndefined();
  expect(() => assertAdultAccess(getStored(), true)).toThrow();
});
it("does not write to another account after a session change", async () => {
  const {auth} = adapter();
  await expect(saveAccountProfile({ username: "Cuenta", birthDate: "1990-06-15" }, "another-owner", {auth})).rejects.toMatchObject({ code: "account_changed" });
  expect(auth.updateUser).not.toHaveBeenCalled();
  await expect(saveAccountProfile({ username: "Cuenta", birthDate: "1990-06-15" }, user.id, {auth, isCurrent: () => false})).rejects.toMatchObject({ code: "account_changed" });
  expect(auth.updateUser).not.toHaveBeenCalled();
});
it("does not report success when persistence is not confirmed", async () => {
  const {auth} = adapter();
  auth.updateUser.mockResolvedValueOnce({ data: { user }, error: null });
  await expect(saveAccountProfile({ username: "Cuenta", birthDate: "1990-06-15" }, user.id, {auth})).rejects.toMatchObject({ code: "profile_save_unconfirmed" });
});
it("keeps return navigation inside the application", () => {
  expect(safeInternalPath("/story/demo?mode=roleplay")).toBe("/story/demo?mode=roleplay");
  for(const value of ["https://outside.invalid", "//outside.invalid", "/\\outside.invalid", "/\ninvalid"]) expect(safeInternalPath(value)).toBe("/");
  expect(profileHref("/chat/demo")).toBe("/profile?returnTo=%2Fchat%2Fdemo");
  expect(profileHref("/profile?returnTo=anything")).toBe("/profile?returnTo=%2Fchat");
});

it("rejects a stale server response when the local session has switched accounts", async () => {
  const fixture = adapter();
  const auth = { ...fixture.auth, getSession: vi.fn(async () => ({ data: { session: { user: { id: "another-owner" } } }, error: null })) };
  await expect(saveAccountProfile({ username: "Cuenta", birthDate: "1990-06-15" }, user.id, {auth})).rejects.toMatchObject({ code: "account_changed" });
  expect(auth.updateUser).not.toHaveBeenCalled();
});
