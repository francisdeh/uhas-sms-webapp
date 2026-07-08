"use client";

import { useState } from "react";
import { MessageSquare, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCommentOnScheme, useScheme } from "@/features/schemes/hooks/use-schemes";
import type { SchemeComment } from "@/features/schemes/types";

interface SchemeCommentThreadProps {
  schemeId: string;
  /** Seed comments (e.g. from a server render); the thread refetches live
   *  detail so it stays current after posting and across reviewers. */
  comments: SchemeComment[];
  currentStaffId: string | null;
  canComment: boolean;
}

export function SchemeCommentThread({
  schemeId,
  comments: seed,
  currentStaffId,
  canComment,
}: SchemeCommentThreadProps) {
  const [draft, setDraft] = useState("");
  const comment = useCommentOnScheme();
  const detail = useScheme(schemeId);
  const comments: SchemeComment[] = detail.data
    ? (detail.data.comments ?? []).map((c) => ({
        id: c.id,
        authorId: c.authorId,
        authorName: c.authorName,
        body: c.body,
        createdAt: c.createdAt ?? null,
      }))
    : seed;

  async function onSend() {
    const body = draft.trim();
    if (!body) return;
    try {
      await comment.mutateAsync({ id: schemeId, payload: { body } });
      setDraft("");
    } catch {
      /* toast fired inside the hook */
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <MessageSquare size={13} />
        Discussion ({comments.length})
      </div>

      {comments.length === 0 ? (
        <p className="text-xs text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {comments.map((c) => {
            const mine = currentStaffId != null && c.authorId === currentStaffId;
            return (
              <li
                key={c.id}
                className={cn(
                  "rounded-md border px-3 py-2 text-sm",
                  mine ? "border-brand/30 bg-brand/5" : "border-border/60 bg-muted/30",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">
                    {mine ? "You" : c.authorName}
                  </span>
                  {c.createdAt && (
                    <span className="text-[11px] text-muted-foreground">
                      {formatDateTime(c.createdAt)}
                    </span>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
              </li>
            );
          })}
        </ul>
      )}

      {canComment && (
        <div className="space-y-2">
          <Textarea
            rows={2}
            placeholder="Add a comment…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="resize-none"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={onSend}
              disabled={comment.isPending || draft.trim().length === 0}
            >
              {comment.isPending ? (
                <Loader2 size={13} className="mr-1.5 animate-spin" />
              ) : (
                <Send size={13} className="mr-1.5" />
              )}
              Comment
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
