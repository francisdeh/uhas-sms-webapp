"use client";

import Link from "next/link";
import { Plus, ChevronRight, BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { LessonPlan } from "@/features/lesson-plans/types";
import { StatusPill } from "./StatusPill";

interface LessonPlansListProps {
  plans: LessonPlan[];
  baseHref: string;
}

export function LessonPlansList({ plans, baseHref }: LessonPlansListProps) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Lesson Plans</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Write or upload weekly plans. Submit to Unit Head → Deputy Head for approval.
          </p>
        </div>
        <Link href={`${baseHref}/new`}>
          <Button>
            <Plus size={14} className="mr-1.5" /> New plan
          </Button>
        </Link>
      </div>

      {plans.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No lesson plans yet"
          description="Write your first plan for an upcoming week. Drafts can be edited and submitted to your Unit Head when ready."
          action={
            <Link href={`${baseHref}/new`}>
              <Button size="sm">
                <Plus size={13} className="mr-1.5" /> New plan
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          {plans.map((plan) => (
            <Link
              key={plan.id}
              href={`${baseHref}/${plan.id}`}
              className="block group"
            >
              <Card className="hover:shadow-sm transition-shadow">
                <CardContent className="py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{plan.topic ?? "(no topic)"}</p>
                      <StatusPill status={plan.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {plan.className} · {plan.subjectName} · Term {plan.term} · Week {plan.week}
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
