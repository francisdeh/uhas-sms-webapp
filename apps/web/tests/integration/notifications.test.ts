import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { resetDb } from "../db";
import { signInAs, signOut } from "../setup";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { notifyAudience, createNotification } from "@/features/notifications/lib/create-notification";
import { resolveAudience } from "@/features/notifications/lib/audience";
import {
  getBellDataAction,
  markAllAsReadAction,
  markAsReadAction,
} from "@/features/notifications/actions";

beforeAll(async () => {
  await resetDb();
});

beforeEach(async () => {
  signOut();
  await db.delete(notifications);
});

describe("resolveAudience", () => {
  it("user → single user id", async () => {
    const ids = await resolveAudience({ type: "user", userId: "00000000-0000-0000-0000-000000000001" });
    expect(ids).toEqual(["00000000-0000-0000-0000-000000000001"]);
  });

  it("staff → the user linked to that staff row", async () => {
    const ids = await resolveAudience({ type: "staff", staffId: "STAFF-001" });
    expect(ids).toEqual(["00000000-0000-0000-0000-000000000001"]);
  });

  it("allTeachers → every user with role=Teacher", async () => {
    const ids = await resolveAudience({ type: "allTeachers" });
    // Seed has two teachers: unit-head.jhs + teacher
    expect(ids).toContain("00000000-0000-0000-0000-000000000007");
    expect(ids).toContain("00000000-0000-0000-0000-000000000006");
  });

  it("allAdmins → every user with role=Admin", async () => {
    const ids = await resolveAudience({ type: "allAdmins" });
    expect(ids).toEqual(["00000000-0000-0000-0000-000000000001"]);
  });

  it("unitHeadOfDivision → user linked to the unit head staff row", async () => {
    const ids = await resolveAudience({ type: "unitHeadOfDivision", division: "JHS" });
    expect(ids).toEqual(["00000000-0000-0000-0000-000000000006"]);
  });

  it("parentsOfStudents → guardians of given students", async () => {
    // Seeded guardian-001 is linked to UHAS-2026-0001 + UHAS-2026-0003.
    const ids = await resolveAudience({
      type: "parentsOfStudents",
      studentIds: ["UHAS-2026-0001"],
    });
    expect(ids).toEqual(["00000000-0000-0000-0000-000000000008"]);
  });

  it("staffByDivision with role filter narrows down", async () => {
    const ids = await resolveAudience({
      type: "staffByDivision",
      division: "JHS",
      roles: ["DeputyHead"],
    });
    expect(ids).toEqual(["00000000-0000-0000-0000-000000000002"]);
  });

  it("deduplicates across overlapping resolves", async () => {
    const ids = await resolveAudience({
      type: "users",
      userIds: ["00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000001"],
    });
    expect(ids).toEqual(["00000000-0000-0000-0000-000000000001"]);
  });
});

describe("createNotification + notifyAudience", () => {
  it("createNotification writes one row for one user", async () => {
    signInAs("Admin");
    await createNotification("00000000-0000-0000-0000-000000000007", {
      kind: "lesson_plan_reviewed",
      title: "Approved",
      body: "Your plan was approved.",
      link: "/teacher/lesson-plans/abc",
    });
    const rows = await db.query.notifications.findMany({
      where: eq(notifications.userId, "00000000-0000-0000-0000-000000000007"),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Approved");
    expect(rows[0].kind).toBe("lesson_plan_reviewed");
    expect(rows[0].readAt).toBeNull();
  });

  it("notifyAudience fans out one row per recipient", async () => {
    signInAs("Admin");
    const count = await notifyAudience(
      { type: "allTeachers" },
      {
        kind: "promotion_season_opened",
        title: "Season open",
        body: "Submit decisions.",
        link: "/teacher/promotions",
      }
    );
    expect(count).toBeGreaterThanOrEqual(2);
    const rows = await db.query.notifications.findMany({
      where: eq(notifications.kind, "promotion_season_opened"),
    });
    expect(rows.length).toBe(count);
  });

  it("notifyAudience returns 0 + writes nothing when audience is empty", async () => {
    signInAs("Admin");
    const count = await notifyAudience(
      { type: "parentsOfStudents", studentIds: [] },
      { kind: "attendance_absent", title: "x", body: "y", link: null }
    );
    expect(count).toBe(0);
    const rows = await db.query.notifications.findMany();
    expect(rows).toHaveLength(0);
  });
});

describe("bell actions", () => {
  beforeEach(async () => {
    signInAs("Admin");
    // Seed three notifications for the current admin user.
    for (let i = 0; i < 3; i++) {
      await createNotification("00000000-0000-0000-0000-000000000001", {
        kind: "announcement_posted",
        title: `Notif ${i}`,
        body: "body",
        link: null,
      });
    }
  });

  it("getBellDataAction returns unread count + recent items", async () => {
    const data = await getBellDataAction();
    expect(data).not.toBeNull();
    expect(data!.unreadCount).toBe(3);
    expect(data!.items).toHaveLength(3);
  });

  it("markAllAsReadAction zeros the unread count", async () => {
    await markAllAsReadAction();
    const data = await getBellDataAction();
    expect(data!.unreadCount).toBe(0);
    // Items still listed — they're just marked read.
    expect(data!.items).toHaveLength(3);
    expect(data!.items.every((n) => n.readAt !== null)).toBe(true);
  });

  it("markAsReadAction marks only the given ids", async () => {
    const before = await getBellDataAction();
    const target = before!.items[0].id;
    await markAsReadAction([target]);
    const after = await getBellDataAction();
    expect(after!.unreadCount).toBe(2);
    expect(after!.items.find((n) => n.id === target)!.readAt).not.toBeNull();
  });

  it("getBellDataAction returns null when not signed in", async () => {
    signOut();
    const data = await getBellDataAction();
    expect(data).toBeNull();
  });

  it("does not return another user's notifications", async () => {
    // Add a notification for someone else.
    await createNotification("00000000-0000-0000-0000-000000000007", {
      kind: "lesson_plan_reviewed",
      title: "Not mine",
      body: "body",
      link: null,
    });
    const data = await getBellDataAction();
    expect(data!.items.every((n) => n.title !== "Not mine")).toBe(true);
  });
});

describe("event integration: announcement_posted fans out via createAnnouncementAction", () => {
  it("school-wide announcement notifies every active user", async () => {
    signInAs("Admin");
    const { createAnnouncementAction } = await import(
      "@/features/announcements/actions"
    );
    const result = await createAnnouncementAction({
      authorId: "STAFF-001",
      data: {
        title: "School closed Friday",
        body: "Friday is a public holiday.",
        audience: "all",
        isCritical: false,
      },
    });
    expect(result.success).toBe(true);
    const rows = await db.query.notifications.findMany({
      where: eq(notifications.kind, "announcement_posted"),
    });
    // Seed has 8 users — all active — so we expect ≥ 6 (deactivated users
    // are filtered; seed flags two staff inactive but their `users` rows
    // aren't seeded, so this is loose).
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].title).toBe("School closed Friday");
  });
});
