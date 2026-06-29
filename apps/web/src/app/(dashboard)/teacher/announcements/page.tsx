import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listAnnouncementsForTeacherAction } from "@/features/announcements/actions";
import { listClassesAction } from "@/features/classes/actions";
import { ParentAnnouncementsList } from "@/features/announcements/components/ParentAnnouncementsList";

export default async function TeacherAnnouncementsPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const [announcements, classes] = await Promise.all([
    listAnnouncementsForTeacherAction(user.linkedId),
    listClassesAction(),
  ]);

  return (
    <ParentAnnouncementsList
      announcements={announcements}
      classes={classes.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
