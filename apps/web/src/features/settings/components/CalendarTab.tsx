"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiError } from "@/lib/api/browser";
import { nextAcademicYear } from "@/features/promotions/lib/academic-year";
import type { SchoolSettings, SchoolTerm } from "@/features/settings/types";

const TERM_LABEL: Record<number, string> = { 1: "First Term", 2: "Second Term", 3: "Third Term" };

export function CalendarTab({ settings }: { settings: SchoolSettings }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [academicYear, setAcademicYear] = useState(settings.academicYear);
  const [termOverride, setTermOverride] = useState(
    settings.currentTermOverride == null ? "auto" : String(settings.currentTermOverride)
  );
  const [terms, setTerms] = useState<{ term: number; startDate: string; endDate: string }[]>(() =>
    seedTerms(settings.terms, settings.academicYear)
  );

  // Year options: current + next academic year (and any others already in DB) —
  // next year is always offered so an Admin can start preparing it even
  // before any school_terms rows exist for it.
  const yearOptions = Array.from(
    new Set([
      settings.academicYear,
      nextAcademicYear(settings.academicYear),
      ...settings.terms.map((t) => t.academicYear),
    ])
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
      // Two requests in sequence — academicYear/currentTermOverride live
      // on the `schools` row; the per-term date ranges live in
      // `school_terms`. Doing them as separate requests mirrors REST
      // resource boundaries; the worst-case interleaving (one succeeds,
      // the other fails) is still a coherent state — the data is just
      // stale on one side.
      await api.school.patch({
        academicYear,
        currentTermOverride: termOverride === "auto" ? null : Number(termOverride),
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
    <div className="space-y-6">
      <Card className="rounded-t-none border-t-0">
        <CardHeader>
          <CardTitle className="text-base">Academic Calendar</CardTitle>
          <CardDescription>
            Active academic year, term date ranges, and the current-term auto-pick. Drives
            report-card headers and dashboard displays.
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
                <Select value={termOverride} onValueChange={(v) => v && setTermOverride(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(value: string) =>
                        value === "auto" ? `Auto — Term ${settings.currentTerm}` : `Pin to Term ${value}`
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto — Term {settings.currentTerm}</SelectItem>
                    <SelectItem value="1">Pin to Term 1</SelectItem>
                    <SelectItem value="2">Pin to Term 2</SelectItem>
                    <SelectItem value="3">Pin to Term 3</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Auto picks the term whose dates below contain today. Pin one to override.
                </p>
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
              <Button onClick={onSave} disabled={saving} variant="brand">
                {saving && <Loader2 size={14} className="animate-spin mr-2" />}
                Save Calendar
              </Button>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <YearRolloverCard settings={settings} />
    </div>
  );
}

function YearRolloverCard({ settings }: { settings: SchoolSettings }) {
  const router = useRouter();
  const [preparing, setPreparing] = useState(false);
  const [activating, setActivating] = useState(false);
  const nextYear = nextAcademicYear(settings.academicYear);
  const nextYearPrepared = settings.terms.some((t) => t.academicYear === nextYear);

  async function onPrepare() {
    setPreparing(true);
    try {
      const result = await api.school.prepareNextYear();
      toast.success(
        `${result.classesCreated} class${result.classesCreated === 1 ? "" : "es"} and ` +
          `${result.termsCreated} term period${result.termsCreated === 1 ? "" : "s"} ` +
          `created for ${result.nextAcademicYear}.`
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't prepare next year.");
    } finally {
      setPreparing(false);
    }
  }

  async function onActivate() {
    setActivating(true);
    try {
      await api.school.activateNextYear();
      toast.success(`${nextYear} is now the active academic year.`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't activate next year.");
    } finally {
      setActivating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          Year Rollover
          <Badge variant="secondary" className="font-normal">
            {settings.academicYear} <ArrowRight size={11} className="mx-1" /> {nextYear}
          </Badge>
        </CardTitle>
        <CardDescription>
          Scaffold next year&apos;s classes and term dates before Promotions opens, then activate
          once every class&apos;s promotion decisions are approved.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col sm:flex-row gap-3">
        <Button onClick={onPrepare} disabled={preparing} variant="outline">
          {preparing && <Loader2 size={14} className="animate-spin mr-2" />}
          Prepare {nextYear}
        </Button>
        <Button onClick={onActivate} disabled={activating || !nextYearPrepared} variant="brand">
          {activating && <Loader2 size={14} className="animate-spin mr-2" />}
          Activate {nextYear}
        </Button>
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
