import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, ClipboardList, Users, Check, AlertTriangle, Lock } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getCurrentSeason } from "@/features/promotions/queries/get-season";
import { getTeacherPromotionClasses } from "@/features/promotions/queries/get-teacher-classes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { PromotionSubmissionStatus } from "@/features/promotions/types";

function statusPill(status: PromotionSubmissionStatus | undefined) {
  switch (status) {
    case "submitted":
      return (
        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-[10px]">
          Submitted
        </Badge>
      );
    case "approved":
      return (
        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px]">
          <Check size={10} className="mr-1" /> Approved
        </Badge>
      );
    case "sent_back":
      return (
        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px]">
          Sent back
        </Badge>
      );
    case "draft":
      return <Badge variant="secondary" className="text-[10px]">Draft</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px]">Not started</Badge>;
  }
}

export default async function TeacherPromotionsPage() {
  const user = await getSessionUser();
  if (!user || user.role !== "Teacher" || !user.linkedId) redirect("/login");

  const [season, classes] = await Promise.all([
    getCurrentSeason(),
    getTeacherPromotionClasses(user.linkedId),
  ]);

  if (!season.isOpen) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold">Promotions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Year-end promotion list for each class you class-teach.
          </p>
        </div>
        <EmptyState
          icon={Lock}
          title="Promotion season is closed"
          description="Ask Admin to open the promotion season for the current academic year."
        />
      </div>
    );
  }

  if (classes.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold">Promotions</h1>
        </div>
        <EmptyState
          icon={ClipboardList}
          title="You are not a class teacher"
          description="The promotion workflow is for class teachers only. Subject teachers don't submit promotion lists."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Promotions</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {season.academicYear} → next academic year. Submit one promotion list per class.
        </p>
      </div>

      {season.season?.openedWithOverride && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/20">
          <AlertTriangle size={14} />
          <AlertDescription>
            Promotion is open without Term-3 results. The system can&apos;t suggest decisions — you&apos;ll
            need to choose each student manually.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">My classes</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-1">
          {classes.map((cls) => (
            <Link
              key={cls.classId}
              href={`/teacher/promotions/${cls.classId}`}
              className="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors group"
            >
              <div className="min-w-0 flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium">{cls.className}</p>
                {statusPill(cls.submission?.status)}
                {!cls.isPrimary && (
                  <Badge variant="outline" className="text-[10px]">View only</Badge>
                )}
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Users size={11} /> {cls.totalStudents}
                </span>
              </div>
              <ChevronRight
                size={14}
                className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              />
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
