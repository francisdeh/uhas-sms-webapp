import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listAuditEvents } from "@/features/audit-log/queries/list-audit-events";
import { AuditLogFilters } from "@/features/audit-log/components/AuditLogFilters";
import { AuditEventRow } from "@/features/audit-log/components/AuditEventRow";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { AuditAction } from "@/lib/audit-log";
import { AUDIT_ACTION_LABELS, PAGE_SIZE, type AuditFilters } from "@/features/audit-log/types";

const VALID_ACTIONS = new Set(Object.keys(AUDIT_ACTION_LABELS));

function parseFilters(raw: { [k: string]: string | string[] | undefined }): AuditFilters {
  const action = typeof raw.action === "string" && VALID_ACTIONS.has(raw.action)
    ? (raw.action as AuditAction)
    : "all";

  const today = new Date();
  const defaultTo = today.toISOString().slice(0, 10);
  const defaultFrom = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const from = typeof raw.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.from)
    ? raw.from
    : defaultFrom;
  const to = typeof raw.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.to)
    ? raw.to
    : defaultTo;

  const pageRaw = typeof raw.page === "string" ? parseInt(raw.page, 10) : 1;
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  return { action, from, to, page };
}

function buildHref(filters: AuditFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.action !== "all") params.set("action", filters.action);
  params.set("from", filters.from);
  params.set("to", filters.to);
  if (page > 1) params.set("page", String(page));
  return `?${params.toString()}`;
}

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const user = await getSessionUser();
  if (!user || user.role !== "Admin") redirect("/login");

  const raw = await searchParams;
  const filters = parseFilters(raw);
  const { events, totalCount } = await listAuditEvents(filters);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Audit log</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Every score override, student edit, role change, and promotion approval is recorded
          here with before / after snapshots.
        </p>
      </div>

      <Card>
        <CardContent className="py-4 space-y-4">
          <AuditLogFilters filters={filters} />
        </CardContent>
      </Card>

      {events.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No events match these filters"
          description="Try widening the date range or selecting a different action type."
        />
      ) : (
        <Card>
          <CardContent className="py-2 px-3">
            {events.map((e) => (
              <AuditEventRow key={e.id} event={e} />
            ))}
          </CardContent>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Showing {(filters.page - 1) * PAGE_SIZE + 1}–
            {Math.min(filters.page * PAGE_SIZE, totalCount)} of {totalCount}
          </p>
          <div className="flex items-center gap-1">
            {filters.page > 1 ? (
              <Link
                href={buildHref(filters, filters.page - 1)}
                className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2.5 py-1.5 text-xs hover:bg-muted transition-colors"
              >
                <ChevronLeft size={12} /> Prev
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md border border-border/40 px-2.5 py-1.5 text-xs text-muted-foreground/50 cursor-not-allowed">
                <ChevronLeft size={12} /> Prev
              </span>
            )}
            <span className="text-xs text-muted-foreground px-2 tabular-nums">
              {filters.page} / {totalPages}
            </span>
            {filters.page < totalPages ? (
              <Link
                href={buildHref(filters, filters.page + 1)}
                className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2.5 py-1.5 text-xs hover:bg-muted transition-colors"
              >
                Next <ChevronRight size={12} />
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md border border-border/40 px-2.5 py-1.5 text-xs text-muted-foreground/50 cursor-not-allowed">
                Next <ChevronRight size={12} />
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
