import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../db";
import { signInAs, signOut } from "../setup";
import { writeAuditLog } from "@/lib/audit-log";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { listAuditEvents } from "@/features/audit-log/queries/list-audit-events";
import { getActorNames } from "@/features/audit-log/queries/get-actor-names";

beforeAll(async () => {
  await resetDb();
});

beforeEach(async () => {
  signOut();
  signInAs("Admin");
  await db.delete(auditLog);
});

describe("writeAuditLog", () => {
  it("inserts a row with shape we expect", async () => {
    await writeAuditLog(db, {
      userId: "00000000-0000-0000-0000-000000000001",
      action: "STUDENT_EDIT",
      targetTable: "students",
      targetId: "UHAS-2026-0001",
      before: { phone: "0200000000" },
      after: { phone: "0244999999" },
    });

    const rows = await db.query.auditLog.findMany({});
    expect(rows.length).toBe(1);
    const r = rows[0];
    expect(r.userId).toBe("00000000-0000-0000-0000-000000000001");
    expect(r.action).toBe("STUDENT_EDIT");
    expect(r.targetTable).toBe("students");
    expect(r.targetId).toBe("UHAS-2026-0001");
    expect(JSON.parse(r.before!)).toEqual({ phone: "0200000000" });
    expect(JSON.parse(r.after!)).toEqual({ phone: "0244999999" });
  });

  it("accepts undefined before/after", async () => {
    await writeAuditLog(db, {
      userId: "00000000-0000-0000-0000-000000000001",
      action: "PROMOTION_APPROVED",
      targetTable: "promotion_submissions",
      targetId: "promotion-sub-x",
      after: { count: 25 },
    });

    const r = await db.query.auditLog.findFirst({});
    expect(r?.before).toBeNull();
    expect(r?.after).toBe(JSON.stringify({ count: 25 }));
  });
});

describe("listAuditEvents", () => {
  async function seedEvents() {
    const actions = ["SCORE_OVERRIDE", "STUDENT_EDIT", "ROLE_CHANGE", "PROMOTION_APPROVED"] as const;
    for (let i = 0; i < 12; i++) {
      await writeAuditLog(db, {
        userId: "00000000-0000-0000-0000-000000000001",
        action: actions[i % actions.length],
        targetTable: "test",
        targetId: `target-${i}`,
        after: { i },
      });
    }
  }

  it("returns events filtered by action", async () => {
    await seedEvents();
    const today = new Date().toISOString().slice(0, 10);
    const result = await listAuditEvents({
      action: "SCORE_OVERRIDE",
      from: "2020-01-01",
      to: today,
      page: 1,
    });
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events.every((e) => e.action === "SCORE_OVERRIDE")).toBe(true);
  });

  it("returns events newest first", async () => {
    await writeAuditLog(db, {
      userId: "00000000-0000-0000-0000-000000000001",
      action: "STUDENT_EDIT",
      targetTable: "students",
      targetId: "old",
    });
    await new Promise((r) => setTimeout(r, 10));
    await writeAuditLog(db, {
      userId: "00000000-0000-0000-0000-000000000001",
      action: "STUDENT_EDIT",
      targetTable: "students",
      targetId: "newer",
    });

    const today = new Date().toISOString().slice(0, 10);
    const result = await listAuditEvents({
      action: "all",
      from: "2020-01-01",
      to: today,
      page: 1,
    });
    expect(result.events[0].targetId).toBe("newer");
    expect(result.events[1].targetId).toBe("old");
  });

  it("paginates correctly", async () => {
    await seedEvents();
    const today = new Date().toISOString().slice(0, 10);
    const p1 = await listAuditEvents({
      action: "all",
      from: "2020-01-01",
      to: today,
      page: 1,
    });
    expect(p1.events.length).toBe(Math.min(50, p1.totalCount));
    expect(p1.totalCount).toBe(12);
  });

  it("date filter excludes events outside the range", async () => {
    await seedEvents();
    const future = "2099-01-01";
    const result = await listAuditEvents({
      action: "all",
      from: future,
      to: future,
      page: 1,
    });
    expect(result.events.length).toBe(0);
  });
});

describe("getActorNames", () => {
  it("resolves Firebase UIDs to staff names via users + staff join", async () => {
    const map = await getActorNames(["00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000007"]);
    expect(map.get("00000000-0000-0000-0000-000000000001")).toBe("Mawuli Agbenyega");
    expect(map.get("00000000-0000-0000-0000-000000000007")).toBe("Selorm Tornu");
  });

  it("returns empty map for empty input", async () => {
    const map = await getActorNames([]);
    expect(map.size).toBe(0);
  });

  it("falls back to email for users with no linkedId or no matching staff", async () => {
    // The parent user (00000000-0000-0000-0000-000000000008) has linkedId="guardian-001" — not a staff.
    const map = await getActorNames(["00000000-0000-0000-0000-000000000008"]);
    expect(map.get("00000000-0000-0000-0000-000000000008")).toBe("parent@uhas.edu.gh");
  });
});

