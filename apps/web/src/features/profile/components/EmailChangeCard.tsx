"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api/browser";

interface EmailChangeCardProps {
  currentEmail: string | null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailChangeCard({ currentEmail }: EmailChangeCardProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseClient(), []);

  const [editing, setEditing] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [pendingTo, setPendingTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Self-heal: a confirmation link click completes on Supabase's side
  // with no callback into this component — if the caller already
  // clicked it (in this tab or another), silently pick up the change
  // on next load rather than requiring a manual "sync now" action.
  useEffect(() => {
    api.me.confirmEmail().catch(() => {
      /* no pending confirmed change to mirror — expected most of the time */
    });
  }, []);

  async function handleSendLink() {
    if (!EMAIL_REGEX.test(newEmail)) {
      toast.error("Enter a valid email address.");
      return;
    }
    setSending(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setSending(false);

    if (error) {
      toast.error(error.message || "Couldn't start the email change.");
      return;
    }
    setPendingTo(newEmail);
    toast.success(`Confirmation link sent to ${newEmail}.`);
  }

  function reset() {
    setEditing(false);
    setNewEmail("");
    setPendingTo(null);
    router.refresh();
  }

  if (pendingTo) {
    return (
      <Field>
        <FieldLabel htmlFor="email">Email Address</FieldLabel>
        <Input
          id="email"
          value={currentEmail || "—"}
          disabled
          className="rounded-md bg-muted/40 cursor-not-allowed"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          We sent a confirmation link to <span className="font-medium">{pendingTo}</span>. Click
          it, then come back here — the change picks up automatically on your next visit.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-1 text-xs text-muted-foreground hover:text-foreground underline w-fit"
        >
          Start over
        </button>
      </Field>
    );
  }

  if (!editing) {
    return (
      <Field>
        <FieldLabel htmlFor="email">Email Address</FieldLabel>
        <div className="flex items-center gap-2">
          <Input
            id="email"
            value={currentEmail || "—"}
            disabled
            className="rounded-md bg-muted/40 cursor-not-allowed"
          />
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            Change
          </Button>
        </div>
      </Field>
    );
  }

  return (
    <Field>
      <FieldLabel htmlFor="newEmail">New Email Address</FieldLabel>
      <div className="flex items-center gap-2">
        <Input
          id="newEmail"
          type="email"
          placeholder="you@uhas.edu.gh"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
        />
        <Button type="button" size="sm" onClick={handleSendLink} disabled={sending}>
          {sending && <Loader2 size={13} className="animate-spin mr-1.5" />}
          Send link
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        We&apos;ll email a confirmation link to the new address before it becomes login-usable.
      </p>
    </Field>
  );
}
