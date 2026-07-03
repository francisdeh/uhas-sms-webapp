import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { ParentAnnouncementsList } from "@/features/announcements/components/ParentAnnouncementsList";
import type { Announcement } from "@/features/announcements/types";

export default async function TeacherAnnouncementsPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const api = await getApi();
  const [announcementsPage, classesPage] = await Promise.all([
    api.announcements.list(),
    api.classes.list({ size: 500 }),
  ]);

  return (
    <ParentAnnouncementsList
      announcements={announcementsPage.items as unknown as Announcement[]}
      classes={classesPage.items.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
