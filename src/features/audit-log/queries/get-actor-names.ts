import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { users, staff } from "@/db/schema";

// audit_log.userId is a Firebase UID. We join users → staff to get a name.
// Returns Map<userId, displayName>. Missing entries indicate "unknown user".
export async function getActorNames(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();

  const userRows = await db.query.users.findMany({
    where: inArray(users.id, userIds),
  });

  const staffIds = userRows
    .map((u) => u.linkedId)
    .filter((id): id is string => !!id);

  const staffById = new Map<string, { firstName: string; lastName: string }>();
  if (staffIds.length > 0) {
    const staffRows = await db.query.staff.findMany({ where: inArray(staff.id, staffIds) });
    for (const s of staffRows) {
      staffById.set(s.id, { firstName: s.firstName, lastName: s.lastName });
    }
  }

  const out = new Map<string, string>();
  for (const u of userRows) {
    if (u.linkedId && staffById.has(u.linkedId)) {
      const s = staffById.get(u.linkedId)!;
      out.set(u.id, `${s.firstName} ${s.lastName}`);
    } else {
      out.set(u.id, u.email);
    }
  }
  return out;
}

// Re-export for the rare callsite that just wants a single name.
export async function getActorName(userId: string): Promise<string | null> {
  const map = await getActorNames([userId]);
  return map.get(userId) ?? null;
}

