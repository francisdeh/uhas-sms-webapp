import { BarChart2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCardLite, Bar } from "./StatCardLite";
import { formatDate } from "@/lib/dates";
import type { ClassStats } from "@/features/reports/types";

function formatDateShort(iso: string): string {
  return formatDate(iso, "EEE, d");
}

function gradeBadgeColor(avg: number): string {
  if (avg >= 80) return "bg-green-100 text-green-700";
  if (avg >= 60) return "bg-blue-100 text-blue-700";
  if (avg >= 50) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

export function TeacherReports({ classes }: { classes: ClassStats[] }) {
  const totalStudents = classes.reduce((sum, c) => sum + c.students, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">My Reports</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Snapshot of every class you teach or class-teach.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCardLite label="Classes" value={classes.length} />
        <StatCardLite label="Students reached" value={totalStudents} />
        <StatCardLite
          label="Subjects covered"
          value={
            new Set(
              classes.flatMap((c) => c.subjectAverages.map((s) => s.subjectId))
            ).size
          }
        />
      </div>

      {classes.length === 0 ? (
        <EmptyState
          icon={BarChart2}
          title="No class data yet"
          description="Stats appear here once you're assigned to a class and start marking attendance or entering scores."
        />
      ) : (
        classes.map((c) => (
          <Card key={c.classId}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-sm font-semibold">{c.className}</CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  {c.students} student{c.students === 1 ? "" : "s"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Attendance — last 7 days
                </p>
                {c.attendanceLast7.every((p) => p.total === 0) ? (
                  <p className="text-sm text-muted-foreground">No sessions recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {c.attendanceLast7.map((p) => (
                      <Bar
                        key={p.date}
                        value={p.present}
                        max={p.total}
                        label={formatDateShort(p.date)}
                        color="bg-emerald-500"
                      />
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Subject averages (from published exams)
                </p>
                {c.subjectAverages.filter((s) => s.samples > 0).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No published scores yet.</p>
                ) : (
                  <div className="space-y-1">
                    {c.subjectAverages
                      .filter((s) => s.samples > 0)
                      .sort((a, b) => b.avg - a.avg)
                      .map((s) => (
                        <div
                          key={s.subjectId}
                          className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0"
                        >
                          <span className="text-sm">{s.subjectName}</span>
                          <span
                            className={
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums " +
                              gradeBadgeColor(s.avg)
                            }
                          >
                            {s.avg} / 100 · {s.samples} score{s.samples === 1 ? "" : "s"}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
