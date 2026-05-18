import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listAnnouncementsAction } from "@/features/announcements/actions";
import { listClassesAction } from "@/features/classes/actions";
import {
  AnnouncementsView,
  type AudienceOption,
} from "@/features/announcements/components/AnnouncementsView";
import { DIVISIONS } from "@/features/auth/types";

export default async function AdminAnnouncementsPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const [announcements, classes] = await Promise.all([
    listAnnouncementsAction(),
    listClassesAction(),
  ]);

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
