import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import type { SchoolSettings } from "@/features/settings/types";

// Both fields below are fixed platform-wide — not enforced from this
// row yet, so they're shown for visibility only. No Save action here:
// there's nothing on this tab an admin can actually change today.
export function SecurityTab({ settings }: { settings: SchoolSettings }) {
  return (
    <Card className="rounded-t-none border-t-0">
      <CardHeader>
        <CardTitle className="text-base">Security Policy</CardTitle>
        <CardDescription>
          Password rules and first-login behavior. Fixed platform-wide for now — not yet
          configurable per school.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-5 max-w-xl">
          <Field>
            <FieldLabel htmlFor="minLen">Minimum password length</FieldLabel>
            <Input id="minLen" type="number" value={settings.passwordMinLength} disabled className="w-40" />
            <p className="text-xs text-muted-foreground mt-1">
              Enforced by the change-password flow.
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
            <Switch checked={settings.forcePasswordChangeOnFirstLogin} disabled />
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
