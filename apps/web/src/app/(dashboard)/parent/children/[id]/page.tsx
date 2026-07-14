import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { KG, type Division } from "@/features/auth/types";
import { formatDate } from "@/lib/dates";
import { getApi } from "@/lib/api/server";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MedicalInfoCard } from "@/features/students/components/MedicalInfoCard";
import { StudentDocumentsCard } from "@/features/students/components/StudentDocumentsCard";
import { BreadcrumbLabel } from "@/features/shell/components/BreadcrumbLabel";

const DIVISION_PILL: Record<string, string> = {
  KG: "bg-purple-100 text-purple-700",
  Primary: "bg-blue-100 text-blue-700",
  JHS: "bg-orange-100 text-orange-700",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ParentChildDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const guardianId = user.linkedId ?? "";
  if (!guardianId) notFound();

  const api = await getApi();
  // GET /students/{id} itself has no ownership gate — verify this
  // student is actually one of this guardian's own children before
  // rendering anything (the gated sub-resources below would 403
  // anyway, but the base record wouldn't).
  const { items: children } = await api.guardians.children(guardianId);
  const student = children.find((s) => s.id === id);
  if (!student) notFound();

  const [guardians, siblings] = await Promise.all([
    api.students.guardians(id),
    api.students.siblings(id),
  ]);

  return (
    <div className="space-y-5">
      <BreadcrumbLabel segment={id} label={`${student.firstName} ${student.lastName}`} />
      <Link
        href="/parent/children"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} className="mr-1" /> Back to my children
      </Link>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-start gap-3">
            <UserAvatar
              photoUrl={student.photoUrl}
              firstName={student.firstName}
              lastName={student.lastName}
              size="md"
              gradient="from-blue-400 to-blue-600"
            />
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold">
                {student.firstName} {student.lastName}
              </p>
              <p className="text-xs text-muted-foreground font-mono">{student.slug}</p>
            </div>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium flex-shrink-0",
                DIVISION_PILL[(student.division ?? KG) as Division],
              )}
            >
              {student.division}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Class</p>
              <p className="font-medium">{student.className ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Date of Birth</p>
              <p className="font-medium">{student.dob ? formatDate(student.dob) : "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Users size={14} /> Guardians
          </h3>
          <ul className="space-y-1">
            {guardians.map((g) => (
              <li key={g.id} className="text-sm flex items-center justify-between gap-2">
                <span>
                  {g.id === guardianId ? "You" : g.name}
                  <span className="ml-1.5 text-xs text-muted-foreground">{g.relationship}</span>
                </span>
                {g.id !== guardianId && (g.phone || g.email) && (
                  <span className="text-xs text-muted-foreground truncate">
                    {g.phone || g.email}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {siblings.length > 0 && (
            <div className="pt-2 border-t border-border/40">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Siblings</p>
              <ul className="space-y-1">
                {siblings.map((s) => (
                  <li key={s.id} className="text-sm flex items-center justify-between gap-2">
                    <span>{s.name}</span>
                    <span className="text-xs text-muted-foreground">{s.className ?? "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <MedicalInfoCard studentId={id} canEdit />
      <StudentDocumentsCard studentId={id} canManage={false} />
    </div>
  );
}
