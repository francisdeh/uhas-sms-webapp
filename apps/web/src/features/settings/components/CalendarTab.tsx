"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiError } from "@/lib/api/browser";
import type { SchoolSettings, SchoolTerm } from "@/features/settings/types";

const TERM_LABEL: Record<number, string> = { 1: "First Term", 2: "Second Term", 3: "Third Term" };

export function CalendarTab({ settings }: { settings: SchoolSettings }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [academicYear, setAcademicYear] = useState(settings.academicYear);
  const [currentTerm, setCurrentTerm] = useState(String(settings.currentTerm));
  const [terms, setTerms] = useState<{ term: number; startDate: string; endDate: string }[]>(() =>
    seedTerms(settings.terms, settings.academicYear)
  );

  // Year options: current + next academic year (and any others already in DB).
  const yearOptions = Array.from(
    new Set([settings.academicYear, ...settings.terms.map((t) => t.academicYear)])
  ).sort();

  function onYearChange(next: string) {
    setAcademicYear(next);
    setTerms(seedTerms(settings.terms, next));
  }

  function updateTerm(term: number, field: "startDate" | "endDate", value: string) {
    setTerms((prev) =>
      prev.map((t) => (t.term === term ? { ...t, [field]: value } : t))
    );
  }

  async function onSave() {
    // Validate dates client-side before the round-trip — same rule the
    // server-side validator enforces, but a quicker error path for users.
    for (const t of terms) {
      if (!t.startDate || !t.endDate) {
        toast.error(`Term ${t.term}: both dates are required.`);
        return;
      }
      if (t.endDate < t.startDate) {
        toast.error(`Term ${t.term}: end date is before start date.`);
        return;
      }
    }

    setSaving(true);
    try {
      // Two PUTs in sequence — academicYear + currentTerm live on the
      // `schools` row; the per-term date ranges live in `school_terms`.
      // Doing them as separate requests mirrors REST resource boundaries;
      // the worst-case interleaving (one succeeds, the other fails) is
      // still a coherent state — the data is just stale on one side.
      await api.school.patch({
        academicYear,
        currentTerm: Number(currentTerm),
      });
      await api.schoolTerms.put({
        academicYear,
        terms: terms.map((t) => ({
          term: t.term,
          startDate: t.startDate,
          endDate: t.endDate,
        })),
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Update failed.");
      return;
    } finally {
      setSaving(false);
    }
    toast.success("Calendar updated.");
    router.refresh();
  }

  return (
    <Card className="rounded-t-none border-t-0">
      <CardHeader>
        <CardTitle className="text-base">Academic Calendar</CardTitle>
        <CardDescription>
          Active academic year, current term, and term date ranges. Drives report-card headers and the
          term auto-pick on dashboards.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-4 max-w-xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field>
              <FieldLabel>Active Academic Year</FieldLabel>
              <Select value={academicYear} onValueChange={(v) => v && onYearChange(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={y}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Current Term</FieldLabel>
              <Select value={currentTerm} onValueChange={(v) => v && setCurrentTerm(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(value: string) => `Term ${value}`}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Term 1</SelectItem>
                  <SelectItem value="2">Term 2</SelectItem>
                  <SelectItem value="3">Term 3</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-2">
            Term dates · {academicYear}
          </p>
          {terms.map((t) => (
            <div key={t.term} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr] gap-3 items-end">
              <Field>
                <FieldLabel>{TERM_LABEL[t.term]}</FieldLabel>
                <Input value={`Term ${t.term}`} disabled className="bg-muted/30" />
              </Field>
              <Field>
                <FieldLabel htmlFor={`start-${t.term}`}>Start date</FieldLabel>
                <Input
                  id={`start-${t.term}`}
                  type="date"
                  value={t.startDate}
                  onChange={(e) => updateTerm(t.term, "startDate", e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`end-${t.term}`}>End date</FieldLabel>
                <Input
                  id={`end-${t.term}`}
                  type="date"
                  value={t.endDate}
                  onChange={(e) => updateTerm(t.term, "endDate", e.target.value)}
                />
              </Field>
            </div>
          ))}

          <div>
            <Button onClick={onSave} disabled={saving} variant="ink">
              {saving && <Loader2 size={14} className="animate-spin mr-2" />}
              Save Calendar
            </Button>
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

// Build a 3-term array for `year`, prefilling from existing rows where available.
function seedTerms(allTerms: SchoolTerm[], year: string) {
  const forYear = allTerms.filter((t) => t.academicYear === year);
  return [1, 2, 3].map((term) => {
    const found = forYear.find((t) => t.term === term);
    return {
      term,
      startDate: found?.startDate ?? "",
      endDate: found?.endDate ?? "",
    };
  });
}
