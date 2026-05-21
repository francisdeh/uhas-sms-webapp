"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AUDIT_ACTION_LABELS, AUDIT_ACTION_PILL, type AuditEventView } from "@/features/audit-log/types";

type Props = {
  event: AuditEventView;
};

// Object → set of keys whose value at the top level differs between before/after.
function changedKeys(before: unknown, after: unknown): Set<string> {
  const out = new Set<string>();
  if (!isObject(before) && !isObject(after)) return out;
  const b = (isObject(before) ? before : {}) as Record<string, unknown>;
  const a = (isObject(after) ? after : {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  for (const k of keys) {
    if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) out.add(k);
  }
  return out;
}

function isObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function renderJson(obj: unknown, highlight: Set<string>): React.ReactNode {
  if (obj == null) return <span className="text-muted-foreground italic">—</span>;
  if (!isObject(obj)) {
    return <pre className="text-[11px] whitespace-pre-wrap break-words">{JSON.stringify(obj, null, 2)}</pre>;
  }
  return (
    <pre className="text-[11px] whitespace-pre-wrap break-words font-mono">
      {"{"}
      {"\n"}
      {Object.entries(obj).map(([k, v]) => (
        <span
          key={k}
          className={cn(
            "block pl-3",
            highlight.has(k) && "bg-amber-100/60 dark:bg-amber-900/30 rounded-sm"
          )}
        >
          <span className="text-blue-700 dark:text-blue-400">&quot;{k}&quot;</span>
          {": "}
          <span>{JSON.stringify(v)}</span>
          {","}
        </span>
      ))}
      {"}"}
    </pre>
  );
}

export function AuditEventRow({ event }: Props) {
  const [open, setOpen] = useState(false);
  const highlight = changedKeys(event.before, event.after);
  const when = new Date(event.createdAt);

  return (
    <div className="border-b border-border/40 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full grid grid-cols-[16px_140px_minmax(0,1fr)_160px_minmax(0,1fr)] sm:grid-cols-[16px_180px_180px_minmax(0,1fr)_minmax(0,1fr)] gap-3 items-center py-3 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors text-left"
      >
        {open ? (
          <ChevronDown size={14} className="text-muted-foreground" />
        ) : (
          <ChevronRight size={14} className="text-muted-foreground" />
        )}
        <span className="text-xs text-muted-foreground tabular-nums">
          {when.toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <span className="text-sm font-medium truncate">{event.actorName ?? event.userId}</span>
        <Badge className={cn(AUDIT_ACTION_PILL[event.action], "hover:" + AUDIT_ACTION_PILL[event.action], "text-[10px] w-fit")}>
          {AUDIT_ACTION_LABELS[event.action]}
        </Badge>
        <span className="text-xs text-muted-foreground truncate font-mono">
          {event.targetTable}
          {event.targetId ? ` · ${event.targetId}` : ""}
        </span>
      </button>

      {open && (
        <div className="px-2 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-border/40 bg-muted/20 p-3 overflow-x-auto">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
              Before
            </p>
            {renderJson(event.before, highlight)}
          </div>
          <div className="rounded-lg border border-border/40 bg-muted/20 p-3 overflow-x-auto">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
              After
            </p>
            {renderJson(event.after, highlight)}
          </div>
        </div>
      )}
    </div>
  );
}
