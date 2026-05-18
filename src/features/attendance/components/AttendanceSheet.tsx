"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { saveSessionAction } from "@/features/attendance/actions";
import type { AttendanceStatus, SessionWithRecords } from "@/features/attendance/types";
import type { Student } from "@/features/students/types";
import { CheckCheck } from "lucide-react";

interface AttendanceSheetProps {
  classId: string;
  className: string;
  date: string;
  term: number;
  students: Student[];
  existingSession: SessionWithRecords | null;
  editable: boolean;
  submittedById: string;
}

type RowState = {
  status: AttendanceStatus;
  lateReason: string;
  note: string;
  expanded: boolean;
};

function buildInitialRows(
  students: Student[],
  existingSession: SessionWithRecords | null
): Record<string, RowState> {
  const rows: Record<string, RowState> = {};
  for (const student of students) {
    const record = existingSession?.records.find((r) => r.studentId === student.id);
    rows[student.id] = {
      status: record?.status ?? "present",
      lateReason: record?.lateReason ?? "",
      note: record?.note ?? "",
      expanded: false,
    };
  }
  return rows;
}

function avatarClasses(division: Student["division"]): string {
  if (division === "KG") return "bg-purple-100 text-purple-700";
  if (division === "Lower Primary") return "bg-sky-100 text-sky-700";
  if (division === "Upper Primary") return "bg-blue-100 text-blue-700";
  return "bg-orange-100 text-orange-700";
}

const STATUS_LABELS: AttendanceStatus[] = ["present", "absent", "late"];

function statusActiveClass(status: AttendanceStatus): string {
  if (status === "present") return "bg-green-100 text-green-700 border-green-300 hover:bg-green-100";
  if (status === "absent") return "bg-red-500 text-white border-red-500 hover:bg-red-600 hover:border-red-600";
  return "bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-100";
}

export function AttendanceSheet({
  classId,
  className,
  date,
  term,
  students,
  existingSession,
  editable,
  submittedById,
}: AttendanceSheetProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    buildInitialRows(students, existingSession)
  );

  function setStatus(studentId: string, status: AttendanceStatus) {
    setRows((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status,
        // auto-open the reason input when marking late
        expanded: status === "late" ? true : prev[studentId].expanded,
        // clear lateReason if no longer late
        lateReason: status === "late" ? prev[studentId].lateReason : "",
      },
    }));
  }

  function updateLateReason(studentId: string, lateReason: string) {
    setRows((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], lateReason },
    }));
  }

  function updateNote(studentId: string, note: string) {
    setRows((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], note },
    }));
  }

  function toggleExpanded(studentId: string) {
    setRows((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], expanded: !prev[studentId].expanded },
    }));
  }

  function markAllPresent() {
    setRows((prev) => {
      const next: Record<string, RowState> = {};
      for (const id of Object.keys(prev)) {
        next[id] = { ...prev[id], status: "present", lateReason: "" };
      }
      return next;
    });
  }

  function handleSave() {
    const missingReasons = students.filter(
      (s) => rows[s.id].status === "late" && !rows[s.id].lateReason.trim()
    );
    if (missingReasons.length > 0) {
      toast.error(`Add a reason for ${missingReasons.length} late student${missingReasons.length === 1 ? "" : "s"}.`);
      return;
    }

    startTransition(async () => {
      const records = students.map((s) => ({
        studentId: s.id,
        status: rows[s.id].status,
        lateReason: rows[s.id].status === "late" ? rows[s.id].lateReason : undefined,
        note: rows[s.id].note || undefined,
      }));

      const result = await saveSessionAction({
        classId,
        date,
        term,
        submittedById,
        records,
      });

      if (result.success) {
        toast.success("Attendance saved.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const formattedDate = new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const presentCount = students.filter((s) => rows[s.id]?.status === "present").length;
  const absentCount = students.filter((s) => rows[s.id]?.status === "absent").length;
  const lateCount = students.filter((s) => rows[s.id]?.status === "late").length;

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-muted-foreground">{formattedDate}</p>
            <p className="font-bold text-lg">{className}</p>
          </div>
          <Badge variant="secondary">Term {term}</Badge>
        </div>

        {!editable && (
          <Alert className="mb-4 border-amber-200 bg-amber-50 text-amber-800">
            <AlertDescription>
              This session is read-only. Only today&apos;s session can be edited.
            </AlertDescription>
          </Alert>
        )}

        {editable && students.length > 0 && (
          <div className="mb-3 flex items-center justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={markAllPresent}
              className="text-xs"
            >
              <CheckCheck size={13} className="mr-1.5" /> Mark all present
            </Button>
          </div>
        )}

        <div>
          {students.map((student) => {
            const row = rows[student.id];
            if (!row) return null;

            return (
              <div key={student.id}>
                <div className="flex items-center gap-3 py-3 border-b border-border/40 last:border-0">
                  <div className="flex-1 flex items-center gap-3">
                    <div
                      className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                        avatarClasses(student.division)
                      )}
                    >
                      {student.firstName[0]}{student.lastName[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {student.firstName} {student.lastName}
                      </p>
                      <p className="hidden sm:block text-xs text-muted-foreground font-mono">{student.id}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {STATUS_LABELS.map((status) => (
                      <Button
                        key={status}
                        variant="outline"
                        size="sm"
                        disabled={!editable}
                        onClick={() => setStatus(student.id, status)}
                        className={cn(
                          "capitalize px-2 sm:px-3",
                          row.status === status && statusActiveClass(status)
                        )}
                      >
                        <span className="hidden sm:inline">{status}</span>
                        <span className="sm:hidden">{status[0].toUpperCase()}</span>
                      </Button>
                    ))}

                    {editable && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpanded(student.id)}
                        className="px-1"
                      >
                        {row.expanded ? (
                          <ChevronUp size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {row.expanded && editable && (
                  <div className="pb-3 pl-12 space-y-2">
                    {row.status === "late" && (
                      <div>
                        <Input
                          placeholder="Reason for lateness (required)"
                          value={row.lateReason}
                          onChange={(e) => updateLateReason(student.id, e.target.value)}
                          className={cn(
                            "h-8 text-sm",
                            !row.lateReason.trim() && "border-amber-300 focus-visible:ring-amber-300"
                          )}
                        />
                      </div>
                    )}
                    <Input
                      placeholder="Add a note (optional)"
                      value={row.note}
                      onChange={(e) => updateNote(student.id, e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {editable && (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {presentCount} present · {absentCount} absent · {lateCount} late
            </p>
            <Button
              onClick={handleSave}
              disabled={isPending}
              className="w-full sm:w-auto"
            >
              {isPending && <Loader2 className="animate-spin" size={14} />}
              Save session
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
