"use server";

import { and, eq, isNull, inArray } from "drizzle-orm";

import { db } from "@/db";
import { notifications } from "@/db/schema";
import { listMyNotifications, getMyUnreadCount } from "@/features/notifications/queries";
import type { ActionResult, NotificationView } from "@/features/notifications/types";
import { getSessionUser } from "@/features/auth/queries/get-session-user";

export type BellData = {
  unreadCount: number;
  items: NotificationView[];
};

// Combined endpoint the bell polls every 60s — one round-trip per poll.
export async function getBellDataAction(): Promise<BellData | null> {
  const session = await getSessionUser();
  if (!session) return null;
  const [items, unreadCount] = await Promise.all([
    listMyNotifications(session.uid, 10),
    getMyUnreadCount(session.uid),
  ]);
  return { unreadCount, items };
}

// Marks every unread notification for the current user as read. Idempotent.
// Called when the bell dropdown opens — chosen UX is "open = saw it" rather
// than per-row clicks.
export async function markAllAsReadAction(): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return { success: false, error: "Not authenticated." };
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, session.uid), isNull(notifications.readAt)));
  return { success: true };
}

// Marks a specific notification as read. Kept for completeness — useful when
// a client wants to mark a single row without opening the dropdown
// (e.g., from a link click that bypasses the bell).
export async function markAsReadAction(ids: string[]): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return { success: false, error: "Not authenticated." };
  if (ids.length === 0) return { success: true };
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, session.uid), inArray(notifications.id, ids)));
  return { success: true };
}
