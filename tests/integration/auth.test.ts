import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "../db";
import { adminAuthMock, getCookie, signInAs, signOut } from "../setup";
import { loginAction } from "@/features/auth/actions/login";
import { changePasswordAction } from "@/features/auth/actions/change-password";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { db } from "@/db";
import { users } from "@/db/schema";

beforeAll(async () => {
  await resetDb();
});

describe("loginAction", () => {
  beforeEach(() => {
    signOut();
    adminAuthMock.verifyIdToken.mockReset();
  });

  it("seed user → success + cookies set + role-based redirect", async () => {
    adminAuthMock.verifyIdToken.mockResolvedValueOnce({
      uid: "uid-admin-001",
      email: "admin@uhas.edu.gh",
    });

    const result = await loginAction("any-token");
    expect(result).toEqual({ success: true, redirect: "/admin" });
    expect(getCookie("session_uid")).toBe("uid-admin-001");
    expect(getCookie("session_role")).toBe("Admin");
    expect(getCookie("session_linked_id")).toBe("STAFF-001");
    expect(getCookie("session_expires_at")).toMatch(/^\d+$/);
  });

  it("DeputyHead redirects to /deputy-head", async () => {
    adminAuthMock.verifyIdToken.mockResolvedValueOnce({
      uid: "uid-deputyhead-jhs",
      email: "dh.jhs@uhas.edu.gh",
    });
    const result = await loginAction("any-token");
    expect(result).toEqual({ success: true, redirect: "/deputy-head" });
  });

  it("Teacher redirects to /teacher", async () => {
    adminAuthMock.verifyIdToken.mockResolvedValueOnce({
      uid: "uid-teacher-001",
      email: "teacher@uhas.edu.gh",
    });
    const result = await loginAction("any-token");
    expect(result).toEqual({ success: true, redirect: "/teacher" });
  });

  it("unknown uid → error", async () => {
    adminAuthMock.verifyIdToken.mockResolvedValueOnce({
      uid: "uid-nobody",
      email: "ghost@example.com",
    });
    const result = await loginAction("any-token");
    expect(result).toEqual({
      success: false,
      error: "Account not found. Contact your administrator.",
    });
  });

  it("deactivated user → error", async () => {
    // Flip the admin to inactive first
    await db.update(users).set({ isActive: false }).where(eq(users.id, "uid-admin-001"));
    adminAuthMock.verifyIdToken.mockResolvedValueOnce({
      uid: "uid-admin-001",
      email: "admin@uhas.edu.gh",
    });
    const result = await loginAction("any-token");
    expect(result).toEqual({
      success: false,
      error: "Account is deactivated. Contact your administrator.",
    });
    // Restore
    await db.update(users).set({ isActive: true }).where(eq(users.id, "uid-admin-001"));
  });

  it("mustChangePassword → redirects to /change-password", async () => {
    await db
      .update(users)
      .set({ mustChangePassword: true })
      .where(eq(users.id, "uid-admin-001"));
    adminAuthMock.verifyIdToken.mockResolvedValueOnce({
      uid: "uid-admin-001",
      email: "admin@uhas.edu.gh",
    });
    const result = await loginAction("any-token");
    expect(result).toEqual({ success: true, redirect: "/change-password" });
    // Reset
    await db
      .update(users)
      .set({ mustChangePassword: false })
      .where(eq(users.id, "uid-admin-001"));
  });

  it("invalid token throws → error response", async () => {
    adminAuthMock.verifyIdToken.mockRejectedValueOnce(new Error("invalid"));
    const result = await loginAction("garbage");
    expect(result).toEqual({
      success: false,
      error: "Invalid session. Please try again.",
    });
  });
});

describe("changePasswordAction", () => {
  beforeEach(() => {
    signOut();
    adminAuthMock.updateUser.mockReset();
  });

  it("clears mustChangePassword flag in DB", async () => {
    signInAs("Admin");
    await db
      .update(users)
      .set({ mustChangePassword: true })
      .where(eq(users.id, "uid-admin-001"));
    adminAuthMock.updateUser.mockResolvedValueOnce({});

    const result = await changePasswordAction("NewSecure@123");
    expect(result).toEqual({ success: true, redirect: "/admin" });

    const after = await db.query.users.findFirst({ where: eq(users.id, "uid-admin-001") });
    expect(after?.mustChangePassword).toBe(false);
  });

  it("returns error when no session", async () => {
    signOut();
    const result = await changePasswordAction("anything");
    expect(result).toEqual({
      success: false,
      error: "Session expired. Please log in again.",
    });
  });

  it("returns error if Firebase update throws", async () => {
    signInAs("Admin");
    adminAuthMock.updateUser.mockRejectedValueOnce(new Error("firebase err"));
    const result = await changePasswordAction("anything");
    expect(result).toEqual({
      success: false,
      error: "Failed to update password. Please try again.",
    });
  });
});

describe("getSessionUser", () => {
  beforeEach(() => {
    signOut();
  });

  it("returns null when no session cookie", async () => {
    const user = await getSessionUser();
    expect(user).toBeNull();
  });

  it("returns SessionUser for signed-in admin", async () => {
    signInAs("Admin");
    const user = await getSessionUser();
    expect(user).toMatchObject({
      uid: "uid-admin-001",
      role: "Admin",
      linkedId: "STAFF-001",
      mustChangePassword: false,
    });
  });

  it("populates isUnitHead + unitHeadOf for Teacher with the flag", async () => {
    // Sign in as Akpene Kpodo (STAFF-004), seeded as JHS Unit Head.
    signInAs("Teacher", {
      session_uid: "uid-unit-head-jhs",
      session_linked_id: "STAFF-004",
    });
    const user = await getSessionUser();
    expect(user).toMatchObject({
      isUnitHead: true,
      unitHeadOf: "JHS",
    });
  });

  it("isUnitHead is false for a non-unit-head teacher", async () => {
    signInAs("Teacher"); // STAFF-005, not a unit head
    const user = await getSessionUser();
    expect(user?.isUnitHead).toBe(false);
    expect(user?.unitHeadOf).toBeNull();
  });
});
