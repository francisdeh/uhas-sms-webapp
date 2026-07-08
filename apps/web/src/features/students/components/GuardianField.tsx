"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Search } from "lucide-react";
import { api } from "@/lib/api/browser";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RELATION_TYPES, type RelationType } from "@/features/students/types";
import type { components } from "@/types/api";

export type GuardianDraft = {
  mode: "create" | "link";
  relation: RelationType;
  isPrimary: boolean;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  guardianId: string | null;
  guardianName: string | null;
};

export function emptyGuardianDraft(isPrimary = false): GuardianDraft {
  return {
    mode: "create",
    relation: "Mother",
    isPrimary,
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    guardianId: null,
    guardianName: null,
  };
}

/** Normalize a draft into the API add-request, or null when incomplete. */
export function draftToPayload(
  d: GuardianDraft,
): components["schemas"]["StudentGuardianAddRequest"] | null {
  if (d.mode === "link") {
    return d.guardianId
      ? { relation: d.relation, isPrimary: d.isPrimary, guardianId: d.guardianId }
      : null;
  }
  const email = d.email.trim();
  const phone = d.phone.trim();
  if (!d.firstName.trim() || !d.lastName.trim() || (!email && !phone)) return null;
  return {
    relation: d.relation,
    isPrimary: d.isPrimary,
    newGuardian: {
      firstName: d.firstName.trim(),
      lastName: d.lastName.trim(),
      email: email || null,
      phone: phone || null,
    },
  };
}

interface GuardianFieldProps {
  value: GuardianDraft;
  onChange: (next: GuardianDraft) => void;
  showPrimary?: boolean;
}

export function GuardianField({ value, onChange, showPrimary = true }: GuardianFieldProps) {
  const [search, setSearch] = useState("");
  const patch = (partial: Partial<GuardianDraft>) => onChange({ ...value, ...partial });

  const results = useQuery({
    queryKey: ["guardian-search", search],
    queryFn: () => api.guardians.list({ q: search, size: 8 }),
    enabled: value.mode === "link" && search.trim().length >= 2,
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Relationship</Label>
          <Select value={value.relation} onValueChange={(v) => patch({ relation: v as RelationType })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RELATION_TYPES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {showPrimary && (
          <div className="flex items-end gap-2 pb-1.5">
            <Switch
              id="guardian-primary"
              checked={value.isPrimary}
              onCheckedChange={(checked) => patch({ isPrimary: checked })}
            />
            <Label htmlFor="guardian-primary" className="cursor-pointer">
              Primary contact
            </Label>
          </div>
        )}
      </div>

      <Tabs value={value.mode} onValueChange={(v) => patch({ mode: v as GuardianDraft["mode"] })}>
        <TabsList className="w-full">
          <TabsTrigger value="create" className="flex-1">
            New guardian
          </TabsTrigger>
          <TabsTrigger value="link" className="flex-1">
            Existing guardian
          </TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="space-y-3 pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="g-first">First name</Label>
              <Input
                id="g-first"
                value={value.firstName}
                onChange={(e) => patch({ firstName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-last">Last name</Label>
              <Input
                id="g-last"
                value={value.lastName}
                onChange={(e) => patch({ lastName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-phone">Phone</Label>
              <Input
                id="g-phone"
                value={value.phone}
                onChange={(e) => patch({ phone: e.target.value })}
                placeholder="+233…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-email">Email</Label>
              <Input
                id="g-email"
                type="email"
                value={value.email}
                onChange={(e) => patch({ email: e.target.value })}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Provide at least a phone or an email.</p>
        </TabsContent>

        <TabsContent value="link" className="space-y-2 pt-3">
          {value.guardianId && value.guardianName ? (
            <div className="flex items-center justify-between rounded-md border border-brand/30 bg-brand/5 px-3 py-2 text-sm">
              <span>{value.guardianName}</span>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => patch({ guardianId: null, guardianName: null })}
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  className="pl-8"
                  placeholder="Search guardians by name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="max-h-40 overflow-y-auto rounded-md border">
                {search.trim().length < 2 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    Type at least 2 characters to search.
                  </p>
                ) : results.isLoading ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>
                ) : (results.data?.items.length ?? 0) === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No guardians found.</p>
                ) : (
                  results.data?.items.map((g) => {
                    const name = `${g.firstName} ${g.lastName}`.trim();
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => patch({ guardianId: g.id, guardianName: name })}
                        className={cn(
                          "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/60",
                        )}
                      >
                        <span>
                          {name}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {g.phone || g.email || g.slug}
                          </span>
                        </span>
                        <Check size={14} className="opacity-0" />
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
