"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Check, Inbox, History } from "lucide-react";
import { ClientDocumentDownloadLink } from "@/features/uploads/components/ClientDocumentDownloadLink";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useAcknowledgeScheme } from "@/features/schemes/hooks/use-schemes";
import type { Scheme } from "@/features/schemes/types";
import { SchemeStatusPill } from "./SchemeStatusPill";
import { SchemeCommentThread } from "./SchemeCommentThread";

interface AdminSchemeReviewProps {
  reviewerId: string;
  pending: Scheme[];
  recent: Scheme[];
}

export function AdminSchemeReview({ reviewerId, pending, recent }: AdminSchemeReviewProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [actingId, setActingId] = useState<string | null>(null);
  const acknowledge = useAcknowledgeScheme();
  const isPending = acknowledge.isPending;

  async function handleAcknowledge(scheme: Scheme) {
    setActingId(scheme.id);
    try {
      await acknowledge.mutateAsync({
        id: scheme.id,
        payload: { comment: comments[scheme.id] || null },
      });
    } catch {
      /* toast fired inside the hook */
    }
    setActingId(null);
  }
  void toast; // silence "unused import" in case of no-op branches

  function toggle(id: string) {
    setOpenId(openId === id ? null : id);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Schemes of Work / Learning</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Submitted schemes from teachers. Acknowledge to mark received.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Pending ({pending.length})</h2>
        {pending.length === 0 ? (
          <EmptyState
            size="compact"
            icon={Inbox}
            title="No pending submissions"
            description="Schemes of Work and Schemes of Learning that teachers submit will appear here."
          />
        ) : (
          pending.map((scheme) => {
            const isOpen = openId === scheme.id;
            return (
              <Card key={scheme.id}>
                <CardContent className="py-4">
                  <button
                    type="button"
                    onClick={() => toggle(scheme.id)}
                    className="w-full flex items-center justify-between text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{scheme.title}</p>
                        <SchemeStatusPill status={scheme.status} />
                        <Badge variant="secondary" className="text-[10px]">
                          {scheme.type === "work" ? "SoW" : "SoL"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {scheme.teacherName} · {scheme.className} · {scheme.subjectName} · Term {scheme.term}
                      </p>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="mt-4 space-y-3 border-t border-border/60 pt-3">
                      {scheme.content && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Content</p>
                          <pre className="text-sm whitespace-pre-wrap bg-muted/40 rounded p-3 max-h-[300px] overflow-y-auto">
                            {scheme.content}
                          </pre>
                        </div>
                      )}
                      {scheme.fileUrl && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Upload</p>
                          <ClientDocumentDownloadLink
                            storagePath={scheme.fileUrl}
                            label="Open attachment"
                            variant="inline"
                          />
                        </div>
                      )}
                      <SchemeCommentThread
                        schemeId={scheme.id}
                        comments={scheme.comments}
                        currentStaffId={reviewerId}
                        canComment
                      />
                      <div className="border-t border-border/60 pt-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Acknowledgement note (optional)
                        </p>
                        <Textarea
                          rows={2}
                          placeholder="Optional note recorded with your acknowledgement…"
                          value={comments[scheme.id] ?? ""}
                          onChange={(e) =>
                            setComments((prev) => ({ ...prev, [scheme.id]: e.target.value }))
                          }
                          className="resize-none"
                        />
                        <div className="flex justify-end mt-2">
                          <Button
                            size="sm"
                            onClick={() => handleAcknowledge(scheme)}
                            disabled={isPending && actingId === scheme.id}
                          >
                            {isPending && actingId === scheme.id ? (
                              <Loader2 size={13} className="animate-spin mr-1.5" />
                            ) : (
                              <Check size={13} className="mr-1.5" />
                            )}
                            Acknowledge
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Recently acknowledged ({recent.length})</h2>
        {recent.length === 0 ? (
          <EmptyState
            size="compact"
            icon={History}
            title="Nothing acknowledged yet"
            description="Schemes you've signed off on will appear here."
          />
        ) : (
          recent.map((scheme) => {
            const isOpen = openId === scheme.id;
            return (
              <Card key={scheme.id}>
                <CardContent className="py-3">
                  <button
                    type="button"
                    onClick={() => toggle(scheme.id)}
                    className="w-full flex items-center justify-between gap-3 text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{scheme.title}</p>
                        <SchemeStatusPill status={scheme.status} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {scheme.teacherName} · {scheme.className} · {scheme.subjectName}
                      </p>
                    </div>
                    {scheme.reviewedByName && (
                      <Badge variant="secondary" className="text-[10px]">
                        by {scheme.reviewedByName}
                      </Badge>
                    )}
                  </button>
                  {isOpen && (
                    <div className="mt-3 border-t border-border/60 pt-3">
                      <SchemeCommentThread
                        schemeId={scheme.id}
                        comments={scheme.comments}
                        currentStaffId={reviewerId}
                        canComment
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </section>

    </div>
  );
}
