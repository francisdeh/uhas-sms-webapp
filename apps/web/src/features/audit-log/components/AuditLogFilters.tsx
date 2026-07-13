"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { RotateCcw, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiError } from "@/lib/api/browser";
import type { AuditAction, AuditActor } from "@/features/audit-log/types";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_TARGET_TABLE_LABELS,
  AUDIT_TARGET_TABLES,
  type AuditFilters,
} from "@/features/audit-log/types";

type Props = {
  filters: AuditFilters;
  actors: AuditActor[];
};

export function AuditLogFilters({ filters, actors }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [exporting, setExporting] = useState(false);

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

  async function exportCsv() {
    setExporting(true);
    try {
      const blob = await api.auditLog.exportCsv({
        action: filters.action !== "all" ? filters.action : undefined,
        userId: filters.userId !== "all" ? filters.userId : undefined,
        targetTable: filters.targetTable !== "all" ? filters.targetTable : undefined,
        from: filters.from,
        to: filters.to,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `audit-log-${filters.from}-to-${filters.to}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to export the audit log.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-4">
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

      <div className="flex-1 min-w-0">
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1 block">
          User
        </label>
        <Select
          value={filters.userId}
          onValueChange={(v) => pushParams({ userId: !v || v === "all" ? "" : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="All users" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            {actors.map((a) => (
              <SelectItem key={a.userId} value={a.userId}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 min-w-0">
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1 block">
          Target
        </label>
        <Select
          value={filters.targetTable}
          onValueChange={(v) => pushParams({ targetTable: !v || v === "all" ? "" : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="All targets" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All targets</SelectItem>
            {AUDIT_TARGET_TABLES.map((t) => (
              <SelectItem key={t} value={t}>
                {AUDIT_TARGET_TABLE_LABELS[t]}
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

      <Button variant="outline" onClick={exportCsv} disabled={exporting} className="shrink-0">
        {exporting ? (
          <Loader2 size={14} className="mr-1.5 animate-spin" />
        ) : (
          <Download size={14} className="mr-1.5" />
        )}
        Export CSV
      </Button>
    </div>
  );
}
