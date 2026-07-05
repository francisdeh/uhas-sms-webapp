"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AuditAction } from "@/features/audit-log/types";
import { AUDIT_ACTION_LABELS, type AuditFilters } from "@/features/audit-log/types";

type Props = {
  filters: AuditFilters;
};

export function AuditLogFilters({ filters }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function pushParams(patch: Record<string, string>) {
    const next = new URLSearchParams(params?.toString() ?? "");
    for (const [key, val] of Object.entries(patch)) {
      if (!val) next.delete(key);
      else next.set(key, val);
    }
    // Reset page when filters change
    if (!("page" in patch)) next.delete("page");
    startTransition(() => router.push(`?${next.toString()}`));
  }

  function reset() {
    startTransition(() => router.push("?"));
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-end gap-2">
      <div className="flex-1 min-w-0">
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1 block">
          Action
        </label>
        <Select
          value={filters.action}
          onValueChange={(v) => pushParams({ action: !v || v === "all" ? "" : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="All actions">
              {(value: AuditAction | "all") =>
                value === "all" || !value ? "All actions" : AUDIT_ACTION_LABELS[value]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {(Object.keys(AUDIT_ACTION_LABELS) as AuditAction[]).map((a) => (
              <SelectItem key={a} value={a}>
                {AUDIT_ACTION_LABELS[a]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1 block">
          From
        </label>
        <Input
          type="date"
          value={filters.from}
          onChange={(e) => pushParams({ from: e.target.value })}
          className="w-[160px]"
        />
      </div>

      <div>
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1 block">
          To
        </label>
        <Input
          type="date"
          value={filters.to}
          onChange={(e) => pushParams({ to: e.target.value })}
          className="w-[160px]"
        />
      </div>

      <Button variant="outline" onClick={reset} disabled={isPending} className="shrink-0">
        {isPending ? (
          <Loader2 size={14} className="mr-1.5 animate-spin" />
        ) : (
          <RotateCcw size={14} className="mr-1.5" />
        )}
        Reset
      </Button>
    </div>
  );
}
