"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Printer, Download, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/api/browser";
import { BATCH_JOB_STATUS, type BatchJobStatus, type ReportCardBatchJob } from "@/features/exams/types";

interface BatchPrintButtonProps {
  examId: string;
  classId: string;
}

const POLL_INTERVAL_MS = 3000;

function toBatchJob(read: {
  id: string;
  examId: string;
  classId: string;
  status: BatchJobStatus;
  downloadUrl?: string | null;
  errorMessage?: string | null;
}): ReportCardBatchJob {
  return {
    id: read.id,
    examId: read.examId,
    classId: read.classId,
    status: read.status,
    downloadUrl: read.downloadUrl ?? null,
    errorMessage: read.errorMessage ?? null,
  };
}

export function BatchPrintButton({ examId, classId }: BatchPrintButtonProps) {
  const [job, setJob] = useState<ReportCardBatchJob | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.exams.reportCardBatch
      .getStatus(examId, classId)
      .then((res) => {
        if (!cancelled) setJob(toBatchJob(res));
      })
      .catch((err) => {
        if (!cancelled && !(err instanceof ApiError && err.status === 404)) {
          toast.error("Failed to check batch print status.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [examId, classId]);

  useEffect(() => {
    if (job?.status !== BATCH_JOB_STATUS.PENDING) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.exams.reportCardBatch.getStatus(examId, classId);
        setJob(toBatchJob(res));
      } catch {
        /* keep polling — transient errors shouldn't stop it */
      }
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [job?.status, examId, classId]);

  async function handleRequest() {
    setLoading(true);
    try {
      const res = await api.exams.reportCardBatch.request(examId, classId);
      setJob(toBatchJob(res));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to start batch print.");
    } finally {
      setLoading(false);
    }
  }

  if (job?.status === BATCH_JOB_STATUS.COMPLETE && job.downloadUrl) {
    return (
      <div className="flex items-center gap-2">
        <a
          href={job.downloadUrl}
          download
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <Download size={13} className="mr-1.5" /> Download class zip
        </a>
        <Button variant="ghost" size="sm" onClick={handleRequest} disabled={loading}>
          Re-run
        </Button>
      </div>
    );
  }

  if (job?.status === BATCH_JOB_STATUS.PENDING) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Loader2 size={13} className="mr-1.5 animate-spin" /> Generating class PDFs…
      </Button>
    );
  }

  if (job?.status === BATCH_JOB_STATUS.FAILED) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-destructive inline-flex items-center gap-1">
          <AlertTriangle size={12} /> {job.errorMessage || "Batch print failed."}
        </span>
        <Button variant="outline" size="sm" onClick={handleRequest} disabled={loading}>
          {loading ? (
            <Loader2 size={13} className="mr-1.5 animate-spin" />
          ) : (
            <Printer size={13} className="mr-1.5" />
          )}
          Retry
        </Button>
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={handleRequest} disabled={loading}>
      {loading ? (
        <Loader2 size={13} className="mr-1.5 animate-spin" />
      ) : (
        <Printer size={13} className="mr-1.5" />
      )}
      Print class report cards
    </Button>
  );
}
