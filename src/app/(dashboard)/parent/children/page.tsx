import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { mockStudentGuardians } from "@/lib/mock/student-guardians";
import { mockStudents } from "@/lib/mock/students";
import { mockClasses } from "@/lib/mock/classes";
import Link from "next/link";
import { GraduationCap, CalendarCheck, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const DIVISION_PILL: Record<string, string> = {
  KG: "bg-purple-100 text-purple-700",
  Primary: "bg-blue-100 text-blue-700",
  JHS: "bg-orange-100 text-orange-700",
};

function formatDob(dob: string) {
  return new Date(dob + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function ParentChildrenPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const guardianId = user.linkedId ?? "";
  const childIds = mockStudentGuardians[guardianId] ?? [];
  if (childIds.length === 0) notFound();

  const children = childIds.flatMap((id) => {
    const student = mockStudents.find((s) => s.id === id);
    if (!student) return [];
    const cls = mockClasses.find((c) => c.id === student.classId);
    return [{ student, className: cls?.name ?? student.className }];
  });

  if (children.length === 0) notFound();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">My Children</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {children.length} child{children.length !== 1 ? "ren" : ""} linked to your account.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {children.map(({ student, className }) => (
          <Card key={student.id}>
            <CardContent className="pt-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                  {student.firstName[0]}{student.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold">
                    {student.firstName} {student.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">{student.id}</p>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium flex-shrink-0",
                    DIVISION_PILL[student.division]
                  )}
                >
                  {student.division}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Class</p>
                  <p className="font-medium">{className}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Gender</p>
                  <p className="font-medium">{student.gender}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Date of Birth</p>
                  <p className="font-medium">{formatDob(student.dob)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={cn("h-1.5 w-1.5 rounded-full", student.isActive ? "bg-green-500" : "bg-gray-400")} />
                    <span className={cn("text-xs", student.isActive ? "text-green-600" : "text-muted-foreground")}>
                      {student.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                <GraduationCap size={12} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground flex-1">{student.nationality ?? "—"} · {student.religion ?? "—"}</span>
              </div>

              <div className="flex gap-2">
                <Link
                  href={`/parent/attendance?studentId=${student.id}`}
                  className="flex items-center gap-1.5 flex-1 justify-center rounded-lg border border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <CalendarCheck size={13} />
                  Attendance
                </Link>
                <Link
                  href={`/parent/results`}
                  className="flex items-center gap-1.5 flex-1 justify-center rounded-lg border border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <FileText size={13} />
                  Results
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
