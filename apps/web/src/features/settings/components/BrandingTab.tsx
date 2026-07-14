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
import type { SchoolSettings } from "@/features/settings/types";

export function BrandingTab({ settings }: { settings: SchoolSettings }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [scheme, setScheme] = useState<"default" | "uhas">(
    (settings.defaultColorScheme as "default" | "uhas") ?? "uhas"
  );
  const [accentHex, setAccentHex] = useState(settings.sidebarAccentHex ?? "");

  async function onSave() {
    setSaving(true);
    try {
      await api.school.patch({
        defaultColorScheme: scheme,
        sidebarAccentHex: accentHex || null,
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Update failed.");
      return;
    } finally {
      setSaving(false);
    }
    toast.success("Branding updated.");
    router.refresh();
  }

  return (
    <Card className="rounded-t-none border-t-0">
      <CardHeader>
        <CardTitle className="text-base">Branding</CardTitle>
        <CardDescription>
          School-wide default theme for new sessions. Individual users can still override their own
          appearance from the user menu.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-5 max-w-md">
          <Field>
            <FieldLabel>Default colour scheme</FieldLabel>
            <Select value={scheme} onValueChange={(v) => v && setScheme(v as "default" | "uhas")}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value: "default" | "uhas") =>
                    value === "uhas" ? "UHAS Brand" : "Default (orange)"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="uhas">UHAS Brand</SelectItem>
                <SelectItem value="default">Default (orange)</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="accentHex">Sidebar accent (optional)</FieldLabel>
            <div className="flex items-center gap-3">
              <Input
                id="accentHex"
                value={accentHex}
                onChange={(e) => setAccentHex(e.target.value)}
                placeholder="#F97316"
                className="w-40"
                maxLength={7}
              />
              {accentHex && /^#[0-9a-fA-F]{6}$/.test(accentHex) && (
                <span
                  className="h-7 w-7 rounded-md border border-border/60"
                  style={{ backgroundColor: accentHex }}
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Six-digit hex. Leave blank to use the colour-scheme default.
            </p>
          </Field>

          <div>
            <Button onClick={onSave} disabled={saving} variant="brand">
              {saving && <Loader2 size={14} className="animate-spin mr-2" />}
              Save Branding
            </Button>
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
