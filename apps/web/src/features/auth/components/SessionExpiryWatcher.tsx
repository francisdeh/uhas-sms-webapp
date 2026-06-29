"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Clock, LogOut } from "lucide-react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";

const WARNING_LEAD_MS = 5 * 60 * 1000; // show modal 5 min before expiry

function formatTimeLeft(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Warns the user 5 minutes before their Supabase session expires and
 * offers to extend it. "Extend" calls `supabase.auth.refreshSession()`,
 * which mints a fresh access token using the refresh token (no
 * re-credential prompt). "Sign out" signs out via the Supabase client.
 *
 * Reads expiry from the Supabase client's in-memory session — no
 * cookies parsed by hand. Subscribed to `onAuthStateChange` so any
 * sign-in / refresh / sign-out elsewhere in the tab reschedules the
 * warning correctly.
 */
export function SessionExpiryWatcher() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const [open, setOpen] = useState(false);
  const [expiryMs, setExpiryMs] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function scheduleWarning(expirySec: number | null | undefined) {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (!expirySec) {
      setExpiryMs(null);
      return;
    }
    const expiry = expirySec * 1000;
    setExpiryMs(expiry);

    const timeUntilWarning = expiry - WARNING_LEAD_MS - Date.now();
    if (timeUntilWarning <= 0) {
      if (Date.now() < expiry) {
        setOpen(true);
      } else {
        router.push("/login");
      }
      return;
    }
    warningTimerRef.current = setTimeout(() => setOpen(true), timeUntilWarning);
  }

  // Pull the current session on mount + subscribe to any auth changes.
  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      scheduleWarning(session?.expires_at);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      scheduleWarning(session?.expires_at);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
    // supabase client is stable across renders; safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While modal is open, tick once per second to update the countdown text.
  useEffect(() => {
    if (!open) {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
      return;
    }
    tickIntervalRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    };
  }, [open]);

  // Auto-redirect if expiry passes while modal is showing.
  useEffect(() => {
    if (!open || expiryMs == null) return;
    if (now >= expiryMs) {
      router.push("/login");
    }
  }, [now, open, expiryMs, router]);

  function handleExtend() {
    startTransition(async () => {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session) {
        toast.error(error?.message ?? "Couldn't extend session. Please sign in again.");
        return;
      }
      setOpen(false);
      toast.success("Session extended.");
      // scheduleWarning will fire again via onAuthStateChange("TOKEN_REFRESHED")
    });
  }

  function handleLogout() {
    startTransition(async () => {
      await supabase.auth.signOut();
      router.push("/login");
    });
  }

  const timeLeftMs = expiryMs == null ? 0 : Math.max(0, expiryMs - now);

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) setOpen(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Clock size={18} className="text-amber-500" />
            Your session is about to expire
          </AlertDialogTitle>
          <AlertDialogDescription>
            You&apos;ll be signed out automatically in{" "}
            <span className="font-mono font-semibold text-foreground">
              {formatTimeLeft(timeLeftMs)}
            </span>
            . Extend to keep working without re-entering your password.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={handleLogout} disabled={isPending}>
            <LogOut size={14} className="mr-1.5" />
            Sign out
          </Button>
          <Button onClick={handleExtend} disabled={isPending}>
            {isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
            Extend session
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
