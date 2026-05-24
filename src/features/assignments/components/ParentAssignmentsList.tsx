import { Calendar, BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DocumentDownloadLink } from "@/features/uploads/components/DocumentDownloadLink";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateWithWeekday as formatDate } from "@/lib/dates";
import type { Assignment } from "@/features/assignments/types";

interface ParentAssignmentsListProps {
  assignments: Assignment[];
  childNames: Record<string, string>;
  classChildIds: Record<string, string[]>;
}

function dueState(iso: string): "overdue" | "today" | "upcoming" {
  const due = new Date(iso + "T23:59:59");
  const now = new Date();
  if (due < now) return "overdue";
  const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 1) return "today";
  return "upcoming";
}

export function ParentAssignmentsList({
  assignments,
  childNames,
  classChildIds,
}: ParentAssignmentsListProps) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Assignments</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Assignments published by teachers for your child(ren)&apos;s class(es).
        </p>
      </div>

      {assignments.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No published assignments"
          description="Once teachers publish assignments for your child's class, you'll see them here with due dates."
        />
      ) : (
        <div className="space-y-2">
          {assignments.map((a) => {
            const childIds = classChildIds[a.classId] ?? [];
            const forText =
              childIds.length === 0
                ? a.className
                : childIds.map((id) => childNames[id]).filter(Boolean).join(", ");
            const state = dueState(a.dueDate);
            return (
              <Card key={a.id}>
                <CardContent className="py-3.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{a.title}</p>
                      <Badge variant="secondary" className="text-[10px]">{a.subjectName}</Badge>
                      {a.fileUrl && (
                        <DocumentDownloadLink
                          storagePath={a.fileUrl}
                          label="Attachment"
                          variant="inline"
                        />
                      )}
                    </div>
                    <span
                      className={
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium " +
                        (state === "overdue"
                          ? "bg-red-100 text-red-700"
                          : state === "today"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-blue-100 text-blue-700")
                      }
                    >
                      <Calendar size={10} /> Due {formatDate(a.dueDate)}
                    </span>
                  </div>
                  {a.description && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    For {forText} · by {a.teacherName}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
