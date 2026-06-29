import "server-only";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import type { NotificationKind, AudienceSpec } from "@/features/notifications/types";
import { resolveAudience } from "./audience";

type Payload = {
  kind: NotificationKind;
  title: string;
  body: string;
  link?: string | null;
};

// Write a single notification for a single user. Useful when the caller
// already knows the exact recipient.
export async function createNotification(
  userId: string,
  payload: Payload
): Promise<void> {
  const schoolId = await getCurrentSchoolId();
  await db.insert(notifications).values({
    schoolId,
    userId,
    kind: payload.kind,
    title: payload.title,
    body: payload.body,
    link: payload.link ?? null,
  });
}

// Write notifications to every user in the resolved audience. One row per
// recipient. Deduplicates + skips deactivated users (handled in resolveAudience).
// Returns the number of rows actually inserted — useful for tests + logs.
export async function notifyAudience(
  audience: AudienceSpec,
  payload: Payload
): Promise<number> {
  const userIds = await resolveAudience(audience);
  if (userIds.length === 0) return 0;

  const schoolId = await getCurrentSchoolId();
  const rows = userIds.map((userId) => ({
    schoolId,
    userId,
    kind: payload.kind,
    title: payload.title,
    body: payload.body,
    link: payload.link ?? null,
  }));

  await db.insert(notifications).values(rows);
  return rows.length;
}
