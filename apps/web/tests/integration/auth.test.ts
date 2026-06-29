/**
 * Auth integration tests — Supabase edition.
 *
 * The old Firebase-based tests for loginAction/changePasswordAction were
 * removed in Phase 1 PR #8 along with loginAction itself. The remaining
 * server-side auth surface is `getSessionUser()`, which composes:
 *   1. `supabase.auth.getUser()` — identity + app_metadata claims
 *   2. our `users` bridge row + linked staff/guardian record
 *
 * The global Supabase mock from tests/setup.ts drives the happy paths via
 * signInAs(); a few edge cases reach past signInAs() to set a raw user
 * shape (e.g. role only in user_metadata, ghost UID).
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { det } from "../../scripts/_seed-data/_uuid";
import { resetDb } from "../db";
import { signInAs, signOut } from "../setup";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

beforeAll(async () => {
  await resetDb();
});

beforeEach(() => {
  signOut();
});

/**
 * Some tests need to inject a Supabase user shape that signInAs() can't
 * produce (e.g. claim-shape edge cases). This helper reaches into the
 * mock's auth.getUser to return a one-shot custom shape.
 */
async function setRawSupabaseUser(user: unknown) {
  const client = (await createSupabaseServerClient()) as unknown as {
    auth: { getUser: ReturnType<typeof vi.fn> };
  };
  client.auth.getUser.mockResolvedValueOnce({ data: { user }, error: null });
}
import { vi } from "vitest";

describe("getSessionUser", () => {
  it("returns null when no session exists", async () => {
    expect(await getSessionUser()).toBeNull();
  });

  it("returns null when JWT has no role claim", async () => {
    await setRawSupabaseUser({
      id: "00000000-0000-0000-0000-000000000001",
      email: "admin@uhas.edu.gh",
      phone: null,
      app_metadata: {}, // no role
      user_metadata: {},
    });
    expect(await getSessionUser()).toBeNull();
  });

  it("returns null when role claim is not in USER_ROLES", async () => {
    signInAs("Admin", { role: "GhostRole" as never });
    expect(await getSessionUser()).toBeNull();
  });

  it("returns null when the bridge users row is missing", async () => {
    signInAs("Admin", { uid: "00000000-0000-0000-0000-DEADBEEF0000" });
    expect(await getSessionUser()).toBeNull();
  });

  it("composes SessionUser for a seeded Admin", async () => {
    signInAs("Admin");
    const user = await getSessionUser();
    expect(user).toMatchObject({
      uid: "00000000-0000-0000-0000-000000000001",
      role: "Admin",
      email: "admin@uhas.edu.gh",
      linkedId: det("STAFF-001"),
      mustChangePassword: false,
      isUnitHead: false,
      unitHeadOf: null,
    });
    // displayName composed from staff row, not the JWT
    expect(user?.displayName).toBe("Mawuli Agbenyega");
  });

  it("populates isUnitHead + unitHeadOf for a Unit-Head Teacher", async () => {
    signInAs("Teacher", {
      uid: "00000000-0000-0000-0000-000000000006",
      linkedId: det("STAFF-004"),
    });
    const user = await getSessionUser();
    expect(user?.isUnitHead).toBe(true);
    expect(user?.unitHeadOf).toBe("JHS");
  });

  it("isUnitHead is false for a plain Teacher", async () => {
    signInAs("Teacher");
    const user = await getSessionUser();
    expect(user?.isUnitHead).toBe(false);
    expect(user?.unitHeadOf).toBeNull();
  });

  it("surfaces must_change_password from user_metadata", async () => {
    signInAs("Admin", { mustChangePassword: true });
    const user = await getSessionUser();
    expect(user?.mustChangePassword).toBe(true);
  });

  it("ignores role claim if present only in user_metadata (privilege guard)", async () => {
    // The frontend NEVER trusts user_metadata for role — that field is
    // user-writable. This test pins the rule so future refactors can't
    // accidentally start reading from it.
    await setRawSupabaseUser({
      id: "00000000-0000-0000-0000-000000000001",
      email: "admin@uhas.edu.gh",
      phone: null,
      app_metadata: {}, // empty — role NOT here
      user_metadata: { role: "Admin", linked_id: "STAFF-001" }, // attacker-controlled
    });
    expect(await getSessionUser()).toBeNull();
  });
});
