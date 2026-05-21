"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { updateSecurityAction } from "@/features/settings/actions";
import type { SchoolSettings } from "@/features/settings/types";

export function SecurityTab({ settings }: { settings: SchoolSettings }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [timeout, setTimeout] = useState(String(settings.sessionTimeoutMinutes));
  const [minLen, setMinLen] = useState(String(settings.passwordMinLength));
  const [forceChange, setForceChange] = useState(settings.forcePasswordChangeOnFirstLogin);

  async function onSave() {
    const timeoutNum = Number(timeout);
    const minLenNum = Number(minLen);
    if (Number.isNaN(timeoutNum) || timeoutNum < 15 || timeoutNum > 1440) {
      toast.error("Session timeout must be between 15 and 1440 minutes.");
      return;
    }
    if (Number.isNaN(minLenNum) || minLenNum < 6 || minLenNum > 64) {
      toast.error("Password length must be between 6 and 64 characters.");
      return;
    }

    setSaving(true);
    const result = await updateSecurityAction({
      sessionTimeoutMinutes: timeoutNum,
      passwordMinLength: minLenNum,
      forcePasswordChangeOnFirstLogin: forceChange,
    });
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Security policy updated.");
    router.refresh();
  }

  return (
    <Card className="rounded-t-none border-t-0">
      <CardHeader>
        <CardTitle className="text-base">Security Policy</CardTitle>
        <CardDescription>
          Session lifetime, password rules, and first-login behavior. Changes apply to subsequent
          logins; existing sessions keep their issued lifetime.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-5 max-w-xl">
          <Field>
            <FieldLabel htmlFor="timeout">Session timeout (minutes)</FieldLabel>
            <Input
              id="timeout"
              type="number"
              min={15}
              max={1440}
              value={timeout}
              onChange={(e) => setTimeout(e.target.value)}
              className="w-40"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Between 15 and 1440 (24 h). Default 480 = 8 hours.
            </p>
          </Field>

          <Field>
            <FieldLabel htmlFor="minLen">Minimum password length</FieldLabel>
            <Input
              id="minLen"
              type="number"
              min={6}
              max={64}
              value={minLen}
              onChange={(e) => setMinLen(e.target.value)}
              className="w-40"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Enforced by the change-password flow + new-user invite emails.
            </p>
          </Field>

          <Separator />

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm font-medium">Force password change on first login</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                When admins create a new user, the first sign-in routes them to /change-password
                before they can use the dashboard.
              </p>
            </div>
            <Switch checked={forceChange} onCheckedChange={setForceChange} />
          </div>

          <div>
            <Button onClick={onSave} disabled={saving} variant="ink">
              {saving && <Loader2 size={14} className="animate-spin mr-2" />}
              Save Security
            </Button>
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
