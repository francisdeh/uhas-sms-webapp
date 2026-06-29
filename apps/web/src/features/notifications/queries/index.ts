import "server-only";
import { and, eq, isNull, desc } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import type { NotificationKind, NotificationView } from "@/features/notifications/types";

// Recent notifications for a user, most recent first. Limit is small (10) —
// the bell dropdown is for at-a-glance; full history would belong on a
// dedicated page if/when needed.
export async function listMyNotifications(
  userId: string,
  limit = 10
): Promise<NotificationView[]> {
  const rows = await db.query.notifications.findMany({
    where: eq(notifications.userId, userId),
    orderBy: [desc(notifications.createdAt)],
    limit,
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as NotificationKind,
    title: r.title,
    body: r.body,
    link: r.link,
    readAt: r.readAt,
    createdAt: r.createdAt,
  }));
}

// Unread badge count. Uses the (user_id, read_at) index.
export async function getMyUnreadCount(userId: string): Promise<number> {
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return rows.length;
}
