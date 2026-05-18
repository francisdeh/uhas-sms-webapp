import Link from "next/link";
import { Plus, ChevronRight, FileText, Calendar, ClipboardList } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { Assignment } from "@/features/assignments/types";

interface AssignmentsListProps {
  assignments: Assignment[];
  baseHref: string;
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function AssignmentsList({ assignments, baseHref }: AssignmentsListProps) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Assignments</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create assignments for your classes. Publishing makes them visible to parents.
          </p>
        </div>
        <Link href={`${baseHref}/new`}>
          <Button>
            <Plus size={14} className="mr-1.5" /> New assignment
          </Button>
        </Link>
      </div>

      {assignments.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No assignments yet"
          description="Create assignments for your classes. Drafts stay private; publish to make them visible to parents."
          action={
            <Link href={`${baseHref}/new`}>
              <Button size="sm">
                <Plus size={13} className="mr-1.5" /> New assignment
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          {assignments.map((a) => (
            <Link key={a.id} href={`${baseHref}/${a.id}`} className="block group">
              <Card className="hover:shadow-sm transition-shadow">
                <CardContent className="py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{a.title}</p>
                      {a.status === "published" ? (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px]">
                          Published
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Draft</Badge>
                      )}
                      {a.fileUrl && <FileText size={11} className="text-muted-foreground" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                      <span>{a.className} · {a.subjectName}</span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar size={11} /> Due {formatDate(a.dueDate)}
                      </span>
                    </p>
                  </div>
                  <ChevronRight
                    size={14}
                    className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
