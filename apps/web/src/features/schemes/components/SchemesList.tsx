import Link from "next/link";
import { Plus, ChevronRight, FileText, ClipboardList } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { WORK, type Scheme } from "@/features/schemes/types";
import { SchemeStatusPill } from "./SchemeStatusPill";

interface SchemesListProps {
  schemes: Scheme[];
  baseHref: string;
}

export function SchemesList({ schemes, baseHref }: SchemesListProps) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Schemes of Work / Learning</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Upload or write term-level schemes. Submit for review and acknowledgement.
          </p>
        </div>
        <Link href={`${baseHref}/new`}>
          <Button variant="brand">
            <Plus size={14} className="mr-1.5" /> New scheme
          </Button>
        </Link>
      </div>

      {schemes.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No schemes submitted"
          description="Create a Scheme of Work or Scheme of Learning for one of your classes. You can upload an existing document or write directly in the system."
          action={
            <Link href={`${baseHref}/new`}>
              <Button variant="brand" size="sm">
                <Plus size={13} className="mr-1.5" /> New scheme
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          {schemes.map((s) => (
            <Link key={s.id} href={`${baseHref}/${s.id}`} className="block group">
              <Card className="hover:shadow-sm transition-shadow">
                <CardContent className="py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{s.title}</p>
                      <SchemeStatusPill status={s.status} />
                      <Badge variant="secondary" className="text-[10px]">
                        {s.type === WORK ? "SoW" : "SoL"}
                      </Badge>
                      {s.fileUrl && <FileText size={11} className="text-muted-foreground" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.className} · {s.subjectName} · Term {s.term} · {s.academicYear}
                    </p>
                  </div>
                  <ChevronRight
                    size={14}
                    className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
