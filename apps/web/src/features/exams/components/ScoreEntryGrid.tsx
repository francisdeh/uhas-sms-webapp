"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Loader2, Save, Lock } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useUpsertScores } from "@/features/exams/hooks/use-exams";
import { useBreadcrumbLabel } from "@/features/shell/breadcrumb-context";
import {
  computeTotalScore,
  computeGrade,
  hasAnyComponentScore,
} from "@/features/exams/utils";
import { EXAM_TYPE, type Exam, type GradingBand, type Score, type ScoreWeights } from "@/features/exams/types";
import { cn } from "@/lib/utils";

type Row = {
  studentId: string;
  studentName: string;
  cat1: string;
  cat2: string;
  projectWork: string;
  groupWork: string;
  examScore: string;
};

interface ScoreEntryGridProps {
  exam: Exam;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  initialRows: { studentId: string; studentName: string; score: Score | null }[];
  // The school's actual (already-resolved) grading bands / score
  // weights, so the live preview column matches what the server will
  // compute + persist on save.
  gradingBands: GradingBand[];
  scoreWeights: ScoreWeights;
  // The school's configured pass mark, shown so teachers can see the
  // threshold while entering scores (totals below it render in red).
  passMark: number;
}

function toRow(r: { studentId: string; studentName: string; score: Score | null }): Row {
  return {
    studentId: r.studentId,
    studentName: r.studentName,
    cat1: r.score?.cat1 != null ? String(r.score.cat1) : "",
    cat2: r.score?.cat2 != null ? String(r.score.cat2) : "",
    projectWork: r.score?.projectWork != null ? String(r.score.projectWork) : "",
    groupWork: r.score?.groupWork != null ? String(r.score.groupWork) : "",
    examScore: r.score?.examScore != null ? String(r.score.examScore) : "",
  };
}

function parseScore(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (Number.isNaN(n)) return null;
  return n;
}

export function ScoreEntryGrid({
  exam,
  classId,
  className,
  subjectId,
  subjectName,
  initialRows,
  gradingBands,
  scoreWeights,
  passMark,
}: ScoreEntryGridProps) {
  useBreadcrumbLabel(exam.id, exam.name);
  useBreadcrumbLabel(classId, className);
  useBreadcrumbLabel(subjectId, subjectName);

  const [rows, setRows] = useState<Row[]>(() => initialRows.map(toRow));
  const upsertScores = useUpsertScores();
  const isPending = upsertScores.isPending;

  const isMidTerm = exam.type === EXAM_TYPE.MID_TERM;
  const locked = exam.isPublished;

  const computed = useMemo(
    () =>
      rows.map((r) => {
        const components = {
          cat1: parseScore(r.cat1),
          cat2: parseScore(r.cat2),
          projectWork: parseScore(r.projectWork),
          groupWork: parseScore(r.groupWork),
          examScore: parseScore(r.examScore),
        };
        const total = hasAnyComponentScore(components)
          ? computeTotalScore(exam.type, components, scoreWeights)
          : null;
        const graded = total != null ? computeGrade(total, gradingBands) : null;
        return { ...r, total, grade: graded?.grade ?? null, interpretation: graded?.interpretation ?? null };
      }),
    [rows, exam.type, scoreWeights, gradingBands]
  );

  function updateField(studentId: string, field: keyof Omit<Row, "studentId" | "studentName">, value: string) {
    if (!/^\d*$/.test(value)) return;
    if (value !== "" && Number(value) > 100) return;
    setRows((prev) =>
      prev.map((r) => (r.studentId === studentId ? { ...r, [field]: value } : r))
    );
  }

  function handleSave() {
    if (locked) return;

    const invalid = rows.find((r) => {
      const fields: (keyof Omit<Row, "studentId" | "studentName">)[] = [
        "cat1",
        "cat2",
        "projectWork",
        "groupWork",
        "examScore",
      ];
      return fields.some((f) => {
        const v = r[f].trim();
        if (v === "") return false;
        const n = Number(v);
        return Number.isNaN(n) || n < 0 || n > 100;
      });
    });
    if (invalid) {
      toast.error(`Invalid score for ${invalid.studentName}. Use whole numbers 0-100.`);
      return;
    }

    const records = rows.map((r) => ({
      studentId: r.studentId,
      cat1: isMidTerm ? null : parseScore(r.cat1),
      cat2: isMidTerm ? null : parseScore(r.cat2),
      projectWork: isMidTerm ? null : parseScore(r.projectWork),
      groupWork: isMidTerm ? null : parseScore(r.groupWork),
      examScore: parseScore(r.examScore),
    }));

    upsertScores.mutate({
      examId: exam.id,
      payload: { classId, subjectId, records },
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{exam.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {className} · {subjectName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{isMidTerm ? "Mid-Term · raw 100" : "End of Term · weighted"}</Badge>
          <Badge variant="outline">Pass mark: {passMark}%</Badge>
          {locked && (
            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
              <Lock size={11} className="mr-1" /> Published
            </Badge>
          )}
        </div>
      </div>

      {locked && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/20">
          <AlertDescription>
            This exam has been published. Scores are read-only. Ask Admin to unpublish to edit.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Student</TableHead>
                {!isMidTerm && (
                  <>
                    <TableHead className="w-20 text-center">CAT 1</TableHead>
                    <TableHead className="w-20 text-center">CAT 2</TableHead>
                    <TableHead className="w-20 text-center">Project</TableHead>
                    <TableHead className="w-20 text-center">Group</TableHead>
                  </>
                )}
                <TableHead className="w-24 text-center">{isMidTerm ? "Mid-Term Exam" : "EoT Exam"}</TableHead>
                <TableHead className="w-20 text-center">Total</TableHead>
                <TableHead className="w-20 text-center">Grade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {computed.map((row) => (
                <TableRow key={row.studentId}>
                  <TableCell className="font-medium text-sm">{row.studentName}</TableCell>
                  {!isMidTerm && (
                    <>
                      <ScoreCell value={row.cat1} disabled={locked} onChange={(v) => updateField(row.studentId, "cat1", v)} />
                      <ScoreCell value={row.cat2} disabled={locked} onChange={(v) => updateField(row.studentId, "cat2", v)} />
                      <ScoreCell value={row.projectWork} disabled={locked} onChange={(v) => updateField(row.studentId, "projectWork", v)} />
                      <ScoreCell value={row.groupWork} disabled={locked} onChange={(v) => updateField(row.studentId, "groupWork", v)} />
                    </>
                  )}
                  <ScoreCell value={row.examScore} disabled={locked} onChange={(v) => updateField(row.studentId, "examScore", v)} />
                  <TableCell
                    className={cn(
                      "text-center text-sm font-semibold tabular-nums",
                      row.total != null && row.total < passMark && "text-red-600"
                    )}
                    title={row.total != null && row.total < passMark ? "Below pass mark" : undefined}
                  >
                    {row.total ?? "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    {row.grade ? (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                          gradeColor(row.grade)
                        )}
                        title={row.interpretation ?? undefined}
                      >
                        {row.grade}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {computed.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isMidTerm ? 4 : 8} className="text-center text-sm text-muted-foreground py-6">
                    No active students in this class.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {!locked && (
        <div className="flex justify-end">
          <Button variant="brand" onClick={handleSave} disabled={isPending}>
            {isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Save size={14} className="mr-1.5" />}
            Save scores
          </Button>
        </div>
      )}
    </div>
  );
}

function ScoreCell({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <TableCell className="p-1">
      <Input
        type="text"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-center tabular-nums"
        placeholder="—"
      />
    </TableCell>
  );
}

function gradeColor(grade: string): string {
  const n = Number(grade);
  if (n <= 2) return "bg-green-100 text-green-700";
  if (n <= 4) return "bg-blue-100 text-blue-700";
  if (n <= 6) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}
