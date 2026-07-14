import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { components } from "@/types/api";

type OnboardingStatus = components["schemas"]["OnboardingStatusRead"];

const STEPS: {
  key: keyof Omit<OnboardingStatus, "allDone">;
  label: string;
  navLabel: string;
  href: string;
}[] = [
  {
    key: "identityDone",
    label: "Add your school's logo and identity",
    navLabel: "Identity",
    href: "/admin/settings?tab=identity",
  },
  {
    key: "gradingDone",
    label: "Confirm your grading scale",
    navLabel: "Grading",
    href: "/admin/settings?tab=grading",
  },
  {
    key: "calendarDone",
    label: "Set up this year's term dates",
    navLabel: "Academic Year & Terms",
    href: "/admin/settings?tab=calendar",
  },
  {
    key: "classesDone",
    label: "Create your first class",
    navLabel: "Classes",
    href: "/admin/classes",
  },
  {
    key: "staffDone",
    label: "Invite a staff member",
    navLabel: "Staff",
    href: "/admin/staff",
  },
];

/**
 * Persistent first-time-setup nudge on the Admin dashboard. Every check
 * is a live read of real data (no stored "onboarding complete" flag) —
 * see `SchoolsService.get_onboarding_status`. Renders nothing once
 * every step is done; there's no dismiss button since it auto-hides.
 */
export function OnboardingChecklist({ status }: { status: OnboardingStatus }) {
  if (status.allDone) return null;

  const doneCount = STEPS.filter((step) => status[step.key]).length;

  return (
    <Card className="mb-6 border-l-4 border-l-brand">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="font-heading text-base font-semibold">Finish setting up your school</h2>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {doneCount} of {STEPS.length} done
          </span>
        </div>
        <ul className="flex flex-col gap-2.5">
          {STEPS.map((step) => {
            const done = status[step.key];
            return (
              <li key={step.key} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2.5 text-sm">
                  {done ? (
                    <CheckCircle2 size={17} className="text-green-600 shrink-0" />
                  ) : (
                    <Circle size={17} className="text-muted-foreground/40 shrink-0" />
                  )}
                  <span className={done ? "text-muted-foreground line-through" : ""}>
                    {step.label}
                  </span>
                </span>
                {!done && (
                  <Link href={step.href} className="text-xs font-medium text-brand hover:underline whitespace-nowrap">
                    Go to {step.navLabel} →
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
