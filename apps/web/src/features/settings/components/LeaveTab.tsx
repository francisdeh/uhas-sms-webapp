"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api/browser";
import type { SchoolSettings } from "@/features/settings/types";

export function LeaveTab({ settings }: { settings: SchoolSettings }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [casualLeaveAnnualDays, setCasualLeaveAnnualDays] = useState(
    String(settings.casualLeaveAnnualDays)
  );

  async function onSave() {
    const days = Number(casualLeaveAnnualDays);
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      toast.error("Casual leave entitlement must be a whole number between 0 and 365.");
      return;
    }

    setSaving(true);
    try {
      await api.school.patch({ casualLeaveAnnualDays: days });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Update failed.");
      return;
    } finally {
      setSaving(false);
    }
    toast.success("Leave settings updated.");
    router.refresh();
  }

  return (
    <Card className="rounded-t-none border-t-0">
      <CardHeader>
        <CardTitle className="text-base">Leave Policy</CardTitle>
        <CardDescription>
          Annual Casual leave entitlement per staff member. Sick, Maternity, Paternity, Study,
          Compassionate, and Other leave don&apos;t draw against a balance.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-5 max-w-xl">
          <Field>
            <FieldLabel htmlFor="casualLeaveAnnualDays">Casual leave days per year</FieldLabel>
            <Input
              id="casualLeaveAnnualDays"
              type="number"
              min={0}
              max={365}
              value={casualLeaveAnnualDays}
              onChange={(e) => setCasualLeaveAnnualDays(e.target.value)}
              className="w-40"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Each staff member&apos;s remaining balance is entitlement minus approved Casual leave
              days taken so far this calendar year.
            </p>
          </Field>

          <div>
            <Button onClick={onSave} disabled={saving} variant="brand">
              {saving && <Loader2 size={14} className="animate-spin mr-2" />}
              Save Leave
            </Button>
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
