import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { getActorNames } from "@/features/audit-log/queries/get-actor-names";
import type { AuditAction } from "@/lib/audit-log";
import { PAGE_SIZE, type AuditEventView, type AuditFilters } from "@/features/audit-log/types";

export type ListAuditEventsResult = {
  events: AuditEventView[];
  totalCount: number;
};

export async function listAuditEvents(filters: AuditFilters): Promise<ListAuditEventsResult> {
  const schoolId = await getCurrentSchoolId();
  const offset = Math.max(0, (filters.page - 1) * PAGE_SIZE);

  // The DATE columns compare as text in PG when given ISO strings;
  // createdAt is a timestamp so we extend the to-bound by one day in code.
  const fromTs = new Date(`${filters.from}T00:00:00Z`);
  const toTs = new Date(`${filters.to}T23:59:59Z`);

  const whereExpr = and(
    eq(auditLog.schoolId, schoolId),
    filters.action !== "all" ? eq(auditLog.action, filters.action) : undefined,
    gte(auditLog.createdAt, fromTs),
    lte(auditLog.createdAt, toTs)
  );

  const [rows, countRows] = await Promise.all([
    db.query.auditLog.findMany({
      where: whereExpr,
      orderBy: [desc(auditLog.createdAt)],
      limit: PAGE_SIZE,
      offset,
    }),
    db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(whereExpr),
  ]);

  const actorIds = Array.from(new Set(rows.map((r) => r.userId)));
  const actorMap = await getActorNames(actorIds);

  const events: AuditEventView[] = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    actorName: actorMap.get(r.userId) ?? null,
    action: r.action as AuditAction,
    targetTable: r.targetTable,
    targetId: r.targetId,
    before: r.before ? safeParse(r.before) : null,
    after: r.after ? safeParse(r.after) : null,
    createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
  }));

  return { events, totalCount: countRows.length };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
