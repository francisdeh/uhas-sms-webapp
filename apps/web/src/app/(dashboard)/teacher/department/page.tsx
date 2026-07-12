import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, Check, Clock, Users } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { getClassTeachersFor } from "@/features/classes/queries/get-class-by-id";
import { getApi } from "@/lib/api/server";
import { ApiError } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TEACHER } from "@/features/auth/types";

export default async function TeacherDepartmentPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  if (!user.isUnitHead || !user.unitHeadOf) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Department</h1>
        <EmptyState
          icon={Building2}
          title="Not a Unit Head"
          description="This page is only available to teachers flagged as Unit Heads. Ask Admin to set the flag if you should have access."
        />
      </div>
    );
  }

  const division = user.unitHeadOf;
  const year = await getCurrentAcademicYear();
  const api = await getApi();

  const divisionClassesRes = await api.classes.list({ division, academicYear: year, size: 200 });
  const divisionClasses = divisionClassesRes.items;
  const classIds = divisionClasses.map((c) => c.id);

  const today = new Date().toISOString().slice(0, 10);
  const submittedClassIds = new Set<string>();
  await Promise.all(
    classIds.map(async (classId) => {
      try {
        await api.attendance.lookupSession({ classId, date: today });
        submittedClassIds.add(classId);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) throw err;
      }
    })
  );

  const staffRes = await api.staff.list({ activeOnly: true, size: 200 });
  const teachers = staffRes.items.filter(
    (s) => s.division === division && s.systemRole === TEACHER
  );

  const teachersMap = await getClassTeachersFor(classIds);
  const studentCountByClass = new Map<string, number>();
  await Promise.all(
    classIds.map(async (classId) => {
      const res = await api.classes.enrollments(classId, { status: "Active" });
      studentCountByClass.set(classId, res.total);
    })
  );

  const classRows = divisionClasses.map((cls) => ({
    ...cls,
    studentCount: studentCountByClass.get(cls.id) ?? 0,
    classTeacherNames: (teachersMap.get(cls.id) ?? []).map((t) => t.staffName),
    attendanceMarked: submittedClassIds.has(cls.id),
  }));


  const todayLabel = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Department — {division}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {todayLabel} · oversight of classes and teachers in your unit.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard label="Classes" value={divisionClasses.length} />
        <SummaryCard
          label="Marked today"
          value={`${classRows.filter((c) => c.attendanceMarked).length} / ${divisionClasses.length}`}
        />
        <SummaryCard label="Teachers in unit" value={teachers.length} />
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Today&apos;s attendance status</h2>
          <Link
            href="/teacher/attendance"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Open my attendance →
          </Link>
        </div>

        {classRows.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={`No classes in ${division}`}
            description="Classes appear here as Admin creates them for the current academic year."
          />
        ) : (
          <div className="space-y-2">
            {classRows.map((c) => (
              <Card key={c.id}>
                <CardContent className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{c.name}</p>
                      <Badge variant="secondary" className="text-[10px]">
                        {c.studentCount} student{c.studentCount === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {c.classTeacherNames.length > 0
                        ? `Class teacher${c.classTeacherNames.length === 1 ? "" : "s"}: ${c.classTeacherNames.join(", ")}`
                        : "No class teacher assigned"}
                    </p>
                  </div>
                  {c.attendanceMarked ? (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px] shrink-0">
                      <Check size={10} className="mr-1" /> Marked
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px] shrink-0">
                      <Clock size={10} className="mr-1" /> Not yet marked
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-3">Teachers in unit</h2>
        {teachers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No teachers in this unit"
            description="Active teachers assigned to this division will appear here."
          />
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">{teachers.length} active</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-1">
              {teachers.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between py-2 border-b border-border/40 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {t.firstName} {t.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">{t.rank ?? ""}</p>
                  </div>
                  {t.isUnitHead && (
                    <Badge variant="secondary" className="text-[10px]">
                      Unit Head
                    </Badge>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
    </div>
  );
}

