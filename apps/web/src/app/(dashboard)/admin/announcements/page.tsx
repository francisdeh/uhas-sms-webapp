import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import {
  AnnouncementsView,
  type AudienceOption,
} from "@/features/announcements/components/AnnouncementsView";
import type { Announcement } from "@/features/announcements/types";
import { DIVISIONS } from "@/features/auth/types";

export default async function AdminAnnouncementsPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const api = await getApi();
  const [announcementsResp, classesResp] = await Promise.all([
    api.announcements.list({ size: 100 }),
    api.classes.list({ size: 100 }),
  ]);
  const announcements: Announcement[] = announcementsResp.items.map((a) => ({
    id: a.id,
    schoolId: a.schoolId,
    title: a.title,
    body: a.body,
    audience: a.audience,
    isCritical: a.isCritical,
    createdById: a.createdById,
    createdByName: a.createdByName,
    createdAt: a.createdAt ?? new Date().toISOString(),
  }));
  const classes = classesResp.items;

  const audienceOptions: AudienceOption[] = [
    { value: "all", label: "All school" },
    ...DIVISIONS.map((d) => ({ value: `division:${d}`, label: `Division — ${d}` })),
    ...classes.map((c) => ({ value: `class:${c.id}`, label: `Class — ${c.name}` })),
  ];

  return (
    <AnnouncementsView
      authorId={user.linkedId}
      announcements={announcements}
      audienceOptions={audienceOptions}
      defaultAudience="all"
      canDeleteAny
      classes={classes.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
