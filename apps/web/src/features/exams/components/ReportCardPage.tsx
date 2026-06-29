"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ReportCard } from "./ReportCard";
import type { ReportCardData } from "@/features/exams/queries/get-report-card";

interface ReportCardPageProps {
  data: ReportCardData;
  backHref: string;
  unpublishedNotice?: boolean;
}

export function ReportCardPage({ data, backHref, unpublishedNotice }: ReportCardPageProps) {
  useEffect(() => {
    document.body.classList.add("print-mode-report-card");
    return () => {
      document.body.classList.remove("print-mode-report-card");
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href={backHref}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} className="mr-1" /> Back
        </Link>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer size={13} className="mr-1.5" /> Print
        </Button>
      </div>

      {unpublishedNotice && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-800 print:hidden">
          <AlertDescription>
            This exam is not yet published. Parents will not see this report card until Admin publishes it.
          </AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 print:overflow-visible print:mx-0 print:px-0">
        <div className="min-w-[640px] sm:min-w-0 mx-auto">
          <ReportCard data={data} />
        </div>
      </div>
    </div>
  );
}
