"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Search, Briefcase } from "lucide-react";
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
  mode: "create" | "link" | "staff";
  relation: RelationType;
  isPrimary: boolean;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  guardianId: string | null;
  guardianName: string | null;
  /** Set when `mode === "staff"` — the picked staff member. Tags a newly
   *  created guardian so it's recognized as staff-backed; also carried
   *  when an existing staff-backed guardian is found (guardianId set). */
  staffId: string | null;
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
    staffId: null,
  };
}

/** Normalize a draft into the API add-request, or null when incomplete. */
export function draftToPayload(
  d: GuardianDraft,
): components["schemas"]["StudentGuardianAddRequest"] | null {
  if (d.mode === "link" || (d.mode === "staff" && d.guardianId)) {
    return d.guardianId
      ? { relation: d.relation, isPrimary: d.isPrimary, guardianId: d.guardianId }
      : null;
  }
  if (d.mode === "staff" && !d.staffId) return null;
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
      staffId: d.mode === "staff" ? d.staffId : null,
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
  const [staffSearch, setStaffSearch] = useState("");
  const [staffLookupPending, setStaffLookupPending] = useState(false);
  const patch = (partial: Partial<GuardianDraft>) => onChange({ ...value, ...partial });

  const results = useQuery({
    queryKey: ["guardian-search", search],
    queryFn: () => api.guardians.list({ q: search, size: 8 }),
    enabled: value.mode === "link" && search.trim().length >= 2,
  });

  const staffResults = useQuery({
    queryKey: ["staff-search", staffSearch],
    queryFn: () => api.staff.list({ q: staffSearch, size: 8, activeOnly: true }),
    enabled: value.mode === "staff" && !value.staffId && staffSearch.trim().length >= 2,
  });

  async function pickStaff(staff: {
    id: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
  }) {
    setStaffLookupPending(true);
    try {
      const existing = await api.guardians.list({ staffId: staff.id, size: 1 });
      const found = existing.items[0];
      if (found) {
        patch({
          staffId: staff.id,
          guardianId: found.id,
          guardianName: `${found.firstName} ${found.lastName}`.trim(),
        });
      } else {
        patch({
          staffId: staff.id,
          guardianId: null,
          guardianName: null,
          firstName: staff.firstName,
          lastName: staff.lastName,
          phone: staff.phone ?? "",
          email: "",
        });
      }
    } finally {
      setStaffLookupPending(false);
    }
  }

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
          <TabsTrigger value="staff" className="flex-1">
            From staff
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

        <TabsContent value="staff" className="space-y-3 pt-3">
          {!value.staffId ? (
            <>
              <div className="relative">
                <Briefcase
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  className="pl-8"
                  placeholder="Search staff by name…"
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                />
              </div>
              <div className="max-h-40 overflow-y-auto rounded-md border">
                {staffLookupPending ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Checking…</p>
                ) : staffSearch.trim().length < 2 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    Type at least 2 characters to search.
                  </p>
                ) : staffResults.isLoading ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>
                ) : (staffResults.data?.items.length ?? 0) === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No staff found.</p>
                ) : (
                  staffResults.data?.items.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => pickStaff(s)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/60"
                    >
                      <span>
                        {s.firstName} {s.lastName}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {s.phone || s.email || s.slug}
                        </span>
                      </span>
                      <Check size={14} className="opacity-0" />
                    </button>
                  ))
                )}
              </div>
            </>
          ) : value.guardianId && value.guardianName ? (
            <div className="flex items-center justify-between rounded-md border border-brand/30 bg-brand/5 px-3 py-2 text-sm">
              <span>{value.guardianName} — already a guardian record</span>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => patch({ staffId: null, guardianId: null, guardianName: null })}
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  New guardian record for this staff member — check the details below.
                </p>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground flex-shrink-0"
                  onClick={() => patch({ staffId: null, guardianId: null, guardianName: null })}
                >
                  Change staff
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="gs-first">First name</Label>
                  <Input
                    id="gs-first"
                    value={value.firstName}
                    onChange={(e) => patch({ firstName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gs-last">Last name</Label>
                  <Input
                    id="gs-last"
                    value={value.lastName}
                    onChange={(e) => patch({ lastName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gs-phone">Phone</Label>
                  <Input
                    id="gs-phone"
                    value={value.phone}
                    onChange={(e) => patch({ phone: e.target.value })}
                    placeholder="+233…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gs-email">
                    Email <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="gs-email"
                    type="email"
                    value={value.email}
                    onChange={(e) => patch({ email: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Left email blank on purpose — avoids clashing with their staff login later. Add
                one only if this guardian identity needs its own.
              </p>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
