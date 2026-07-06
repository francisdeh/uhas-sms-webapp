"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import { api, ApiError } from "@/lib/api/browser";
import type {
  SchoolSettings,
  GradingBand,
  GradingDefaults,
  ScoreWeights,
} from "@/features/settings/types";

const WEIGHT_LABELS: { key: keyof ScoreWeights; label: string }[] = [
  { key: "exam", label: "End-of-Term Exam" },
  { key: "cat1", label: "CAT 1" },
  { key: "cat2", label: "CAT 2" },
  { key: "groupWork", label: "Group Work" },
  { key: "projectWork", label: "Project Work" },
];

export function GradingTab({
  settings,
  defaults,
}: {
  settings: SchoolSettings;
  defaults: GradingDefaults;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [scale, setScale] = useState<"GES_STANDARD" | "CUSTOM">(
    (settings.gradingScale as "GES_STANDARD" | "CUSTOM") ?? "GES_STANDARD"
  );
  const [bands, setBands] = useState<GradingBand[]>(settings.gradingBands);
  const [weights, setWeights] = useState<ScoreWeights>(settings.scoreWeights);
  const [passMark, setPassMark] = useState(String(settings.passMark));

  const weightSum =
    weights.exam + weights.cat1 + weights.cat2 + weights.groupWork + weights.projectWork;

  function updateBand(idx: number, field: keyof GradingBand, value: string | number) {
    setBands((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, [field]: value } : b))
    );
  }

  function updateWeight(key: keyof ScoreWeights, value: number) {
    setWeights((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave() {
    if (weightSum !== 100) {
      toast.error(`Score weights must sum to 100 (currently ${weightSum}).`);
      return;
    }
    setSaving(true);
    try {
      await api.school.patch({
        gradingScale: scale,
        gradingBands: scale === "CUSTOM" ? bands : null,
        scoreWeights: weights,
        passMark: Number(passMark),
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Update failed.");
      return;
    } finally {
      setSaving(false);
    }
    toast.success("Grading config updated.");
    router.refresh();
  }

  return (
    <Card className="rounded-t-none border-t-0">
      <CardHeader>
        <CardTitle className="text-base">Grading & Scoring</CardTitle>
        <CardDescription>
          Grade bands, score component weights, and the pass-mark threshold used by the promotion
          auto-suggest.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-5 max-w-xl">
          <Field>
            <FieldLabel>Grading scale</FieldLabel>
            <Select value={scale} onValueChange={(v) => v && setScale(v as "GES_STANDARD" | "CUSTOM")}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value: "GES_STANDARD" | "CUSTOM") =>
                    value === "CUSTOM" ? "Custom bands" : "GES Standard (9 bands)"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GES_STANDARD">GES Standard (9 bands)</SelectItem>
                <SelectItem value="CUSTOM">Custom bands</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {scale === "CUSTOM" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Custom bands
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setBands(defaults.gradingBands)}
                  className="text-xs"
                  type="button"
                >
                  <RotateCcw size={12} className="mr-1.5" />
                  Reset to GES standard
                </Button>
              </div>
              <div className="space-y-2">
                {bands.map((b, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_2fr] gap-2 items-center">
                    <Input
                      type="number"
                      value={b.min}
                      onChange={(e) => updateBand(i, "min", Number(e.target.value))}
                      placeholder="Min"
                    />
                    <Input
                      type="number"
                      value={b.max}
                      onChange={(e) => updateBand(i, "max", Number(e.target.value))}
                      placeholder="Max"
                    />
                    <Input
                      value={b.grade}
                      onChange={(e) => updateBand(i, "grade", e.target.value)}
                      placeholder="Grade"
                    />
                    <Input
                      value={b.interpretation}
                      onChange={(e) => updateBand(i, "interpretation", e.target.value)}
                      placeholder="Interpretation"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Score component weights
              </p>
              <span
                className={`text-xs font-medium ${
                  weightSum === 100 ? "text-green-600" : "text-amber-600"
                }`}
              >
                Total: {weightSum}%
              </span>
            </div>
            <div className="space-y-2">
              {WEIGHT_LABELS.map(({ key, label }) => (
                <div key={key} className="grid grid-cols-[1fr_120px] gap-3 items-center">
                  <label className="text-sm">{label}</label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={weights[key]}
                    onChange={(e) => updateWeight(key, Number(e.target.value))}
                  />
                </div>
              ))}
            </div>
          </div>

          <Separator />

          <Field>
            <FieldLabel htmlFor="passMark">Pass mark (%)</FieldLabel>
            <Input
              id="passMark"
              type="number"
              min={0}
              max={100}
              value={passMark}
              onChange={(e) => setPassMark(e.target.value)}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Used by the promotion auto-suggest. Students with more than two core subjects below
              this mark default to Repeat.
            </p>
          </Field>

          <div>
            <Button onClick={onSave} disabled={saving} variant="ink">
              {saving && <Loader2 size={14} className="animate-spin mr-2" />}
              Save Grading
            </Button>
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
