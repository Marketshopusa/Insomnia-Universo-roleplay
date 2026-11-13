import { expect, it } from "vitest";
import { assertAuthProject } from "./authProject.mjs";
it("rejects the old Lovable project when the server uses the migrated project", () => {
  expect(() => assertAuthProject("https://pbormuamewbajnylzfqs.supabase.co", "https://cexzmelshvbgabihtfvx.supabase.co")).toThrow("AUTH_PROJECT_MISMATCH");
  expect(() => assertAuthProject("https://cexzmelshvbgabihtfvx.supabase.co/", "https://cexzmelshvbgabihtfvx.supabase.co")).not.toThrow();
});
