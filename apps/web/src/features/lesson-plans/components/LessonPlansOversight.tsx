"use client";

import { useState, useMemo } from "react";
import { ChevronDown, Search, BookOpen, Filter } from "lucide-react";
import { ClientDocumentDownloadLink } from "@/features/uploads/components/ClientDocumentDownloadLink";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import {
  LESSON_PLAN_STATUS,
  type LessonPlan,
  type LessonPlanStatus,
} from "@/features/lesson-plans/types";
import { DIVISIONS, type Division } from "@/features/auth/types";
import { StatusPill, LESSON_PLAN_STATUS_LABELS } from "./StatusPill";
import { cn } from "@/lib/utils";

const STATUS_FILTERS: ("all" | LessonPlanStatus)[] = [
  "all",
  LESSON_PLAN_STATUS.DRAFT,
  LESSON_PLAN_STATUS.SUBMITTED,
  LESSON_PLAN_STATUS.UNIT_HEAD_APPROVED,
  LESSON_PLAN_STATUS.APPROVED,
  LESSON_PLAN_STATUS.REJECTED,
];

const DIVISION_FILTERS: ("all" | Division)[] = ["all", ...DIVISIONS];

interface LessonPlansOversightProps {
  plans: LessonPlan[];
}

export function LessonPlansOversight({ plans }: LessonPlansOversightProps) {
  const [statusFilter, setStatusFilter] = useState<"all" | LessonPlanStatus>("all");
  const [divisionFilter, setDivisionFilter] = useState<"all" | Division>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plans.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (divisionFilter !== "all" && p.division !== divisionFilter) return false;
      if (q) {
        const hay = `${p.topic ?? ""} ${p.teacherName} ${p.className} ${p.subjectName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [plans, statusFilter, divisionFilter, query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: plans.length };
    for (const s of STATUS_FILTERS) {
      if (s === "all") continue;
      c[s] = plans.filter((p) => p.status === s).length;
    }
    return c;
  }, [plans]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Lesson Plans — School-wide</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Read-only oversight of every lesson plan submitted in the current academic year. The approval chain
          stays with Unit Heads and Deputy Heads.
        </p>
      </div>

      <div className="bg-card border border-border/60 rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by topic, teacher, class, subject…"
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer border",
                statusFilter === s
                  ? "bg-slate-800 text-white border-slate-800 dark:bg-slate-600 dark:border-slate-600"
                  : "bg-transparent text-muted-foreground border-border/60 hover:border-border hover:text-foreground"
              )}
            >
              {s === "all" ? "All statuses" : LESSON_PLAN_STATUS_LABELS[s]}
              <span className="tabular-nums opacity-70">({counts[s] ?? 0})</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {DIVISION_FILTERS.map((d) => (
            <button
              key={d}
              onClick={() => setDivisionFilter(d)}
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer border",
                divisionFilter === d
                  ? "bg-slate-800 text-white border-slate-800 dark:bg-slate-600 dark:border-slate-600"
                  : "bg-transparent text-muted-foreground border-border/60 hover:border-border hover:text-foreground"
              )}
            >
              {d === "all" ? "All divisions" : d}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        plans.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No lesson plans this year"
            description="Lesson plans appear here as teachers submit them. The list is filtered to the academic year selected in the header."
          />
        ) : (
          <EmptyState
            icon={Filter}
            title="No plans match the current filters"
            description="Try widening your search or clearing the status/division filters above."
          />
        )
      ) : (
        <div className="space-y-2">
          {filtered.map((plan) => {
            const isOpen = openId === plan.id;
            return (
              <Card key={plan.id}>
                <CardContent className="py-3.5">
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : plan.id)}
                    className="w-full text-left flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{plan.topic ?? "(no topic)"}</p>
                        <StatusPill status={plan.status} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {plan.teacherName} · {plan.className} · {plan.subjectName} · Term {plan.term} · Week{" "}
                        {plan.week}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {plan.division}
                    </Badge>
                    <ChevronDown
                      size={14}
                      className={cn(
                        "text-muted-foreground transition-transform shrink-0",
                        isOpen && "rotate-180"
                      )}
                    />
                  </button>

                  {isOpen && (
                    <div className="mt-4 space-y-3 border-t border-border/60 pt-3">
                      <DetailRow label="Learning objectives" value={plan.learningObjectives} />
                      <DetailRow label="Teaching methods" value={plan.teachingMethods} />
                      <DetailRow label="Resources" value={plan.resources} />
                      <DetailRow label="Assessment plan" value={plan.assessmentPlan} />
                      {plan.fileUrl && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Attachment</p>
                          <ClientDocumentDownloadLink
                            storagePath={plan.fileUrl}
                            label="Open attachment"
                          />
                        </div>
                      )}
                      {plan.reviewerComment && (
                        <Alert>
                          <AlertDescription>
                            <strong>Reviewer note ({plan.reviewedByName}):</strong> {plan.reviewerComment}
                          </AlertDescription>
                        </Alert>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        Last updated{" "}
                        {new Date(plan.updatedAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm whitespace-pre-wrap">{value}</p>
    </div>
  );
}
