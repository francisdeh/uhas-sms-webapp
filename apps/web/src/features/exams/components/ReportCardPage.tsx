"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ReportCard } from "./ReportCard";
import type { ReportCardData, ReportCardVariant } from "@/features/exams/types";
import { api, ApiError } from "@/lib/api/browser";

interface ReportCardPageProps {
  data: ReportCardData;
  backHref: string;
  studentId: string;
  examId: string;
  unpublishedNotice?: boolean;
}

export function ReportCardPage({
  data,
  backHref,
  studentId,
  examId,
  unpublishedNotice,
}: ReportCardPageProps) {
  const [downloading, setDownloading] = useState(false);
  const [variant, setVariant] = useState<ReportCardVariant>("summary");
  const full = variant === "full";

  useEffect(() => {
    document.body.classList.add("print-mode-report-card");
    return () => {
      document.body.classList.remove("print-mode-report-card");
    };
  }, []);

  async function handleDownload() {
    setDownloading(true);
    try {
      const blob = await api.studentViews.reportCardPdf(studentId, examId, full);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `report-card-${studentId}-${examId}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to download report card.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href={backHref}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} className="mr-1" /> Back
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="full-report"
              checked={full}
              onCheckedChange={(checked) => setVariant(checked ? "full" : "summary")}
            />
            <Label htmlFor="full-report" className="text-sm text-muted-foreground cursor-pointer">
              Show score breakdown
            </Label>
          </div>
          <Button variant="outline" size="sm" onClick={handleDownload} disabled={downloading}>
            {downloading ? (
              <Loader2 size={13} className="mr-1.5 animate-spin" />
            ) : (
              <Download size={13} className="mr-1.5" />
            )}
            Download PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer size={13} className="mr-1.5" /> Print
          </Button>
        </div>
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
          <ReportCard data={data} variant={variant} />
        </div>
      </div>
    </div>
  );
}
