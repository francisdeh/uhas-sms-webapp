import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listAnnouncementsForDeputyAction } from "@/features/announcements/actions";
import { listClassesAction } from "@/features/classes/actions";
import { getDeputyHeadDivision } from "@/features/students/queries/get-deputy-head-division";
import {
  AnnouncementsView,
  type AudienceOption,
} from "@/features/announcements/components/AnnouncementsView";
import { Card, CardContent } from "@/components/ui/card";

export default async function DeputyHeadAnnouncementsPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const division = await getDeputyHeadDivision(user.linkedId);
  if (!division) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Announcements</h1>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No division assigned to your account.
          </CardContent>
        </Card>
      </div>
    );
  }

  const [announcements, classes] = await Promise.all([
    listAnnouncementsForDeputyAction(user.linkedId),
    listClassesAction(division),
  ]);

  const audienceOptions: AudienceOption[] = [
    { value: `division:${division}`, label: `Division — ${division}` },
  ];

  return (
    <AnnouncementsView
      authorId={user.linkedId}
      announcements={announcements}
      audienceOptions={audienceOptions}
      defaultAudience={`division:${division}`}
      classes={classes.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
