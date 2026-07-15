import { Alert, AlertDescription } from "@/components/ui/alert";

type Comment = {
  id: string;
  authorName: string;
  body: string;
  createdAt?: string | null;
};

/** Renders the full review-comment history for a submission — replaces
 *  the old single overwriting `reviewerComment` field, which lost the
 *  first comment on a second send-back. */
export function PromotionCommentThread({ comments }: { comments: Comment[] }) {
  if (comments.length === 0) return null;

  return (
    <div className="space-y-2">
      {comments.map((c) => (
        <Alert
          key={c.id}
          className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/20"
        >
          <AlertDescription>
            <span className="font-medium">{c.authorName}</span>
            {c.createdAt ? (
              <span className="text-xs opacity-75"> · {new Date(c.createdAt).toLocaleString()}</span>
            ) : null}
            <p className="mt-0.5">{c.body}</p>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
