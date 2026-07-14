import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { SCORE_ENTRY_STATUS, type ScoreCompletenessRow, type ScoreEntryStatus } from "@/features/exams/types";

const STATUS_META: Record<ScoreEntryStatus, { label: string; className: string }> = {
  complete: { label: "Complete", className: "bg-green-100 text-green-700 border border-green-300" },
  partial: { label: "Partial", className: "bg-amber-100 text-amber-700 border border-amber-300" },
  not_started: { label: "Not started", className: "bg-red-100 text-red-700 border border-red-300" },
};

/**
 * Read-only "who still owes scores" table for a class + exam, shown to
 * the class teacher above the report form. Purely presentational —
 * fetched server-side on the class-report page.
 */
export function ScoreCompletenessPanel({
  rows,
  rosterCount,
}: {
  rows: ScoreCompletenessRow[];
  rosterCount: number;
}) {
  const pending = rows.filter((r) => r.status !== SCORE_ENTRY_STATUS.COMPLETE).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Score entry status</CardTitle>
        <CardDescription>
          {rosterCount === 0
            ? "No active students in this class yet."
            : pending === 0
              ? "All subjects have scores entered for every student."
              : `${pending} of ${rows.length} subject${rows.length === 1 ? "" : "s"} still need scores.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[160px]">Subject</TableHead>
              <TableHead className="min-w-[140px]">Teacher</TableHead>
              <TableHead className="w-24 text-center">Entered</TableHead>
              <TableHead className="w-32 text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.subjectId}>
                <TableCell className="font-medium text-sm">{r.subjectName}</TableCell>
                <TableCell className="text-sm">
                  {r.teacherName ?? (
                    <span className="text-muted-foreground italic">Unassigned</span>
                  )}
                </TableCell>
                <TableCell className="text-center text-sm tabular-nums">
                  {r.enteredCount}/{r.rosterCount}
                </TableCell>
                <TableCell className="text-center">
                  <Badge className={cn("text-[11px]", STATUS_META[r.status].className)}>
                    {STATUS_META[r.status].label}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                  No subjects assigned to this class.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
