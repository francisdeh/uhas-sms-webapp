"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PscReport } from "./PscReport";
import type { PscReportData } from "@/features/reports/queries/get-psc-report";

export function PscReportPage({ data, backHref }: { data: PscReportData; backHref: string }) {
  useEffect(() => {
    document.body.classList.add("print-mode-report-card");
    return () => document.body.classList.remove("print-mode-report-card");
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href={backHref}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} className="mr-1" /> Back to reports
        </Link>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer size={13} className="mr-1.5" /> Print
        </Button>
      </div>
      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 print:overflow-visible print:mx-0 print:px-0">
        <div className="min-w-[640px] sm:min-w-0 mx-auto">
          <PscReport data={data} />
        </div>
      </div>
    </div>
  );
}
