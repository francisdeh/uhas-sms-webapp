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
import { extendSessionAction } from "@/features/auth/actions/extend-session";
import { logoutAction } from "@/features/auth/actions/logout";

const WARNING_LEAD_MS = 5 * 60 * 1000; // show modal 5 min before expiry

function readExpiryMs(): number | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)session_expires_at=(\d+)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function formatTimeLeft(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function SessionExpiryWatcher() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [expiryMs, setExpiryMs] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reschedule the warning timer whenever the expiry changes (login/extend).
  useEffect(() => {
    function schedule() {
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      const expiry = readExpiryMs();
      setExpiryMs(expiry);
      if (expiry == null) return;

      const timeUntilWarning = expiry - WARNING_LEAD_MS - Date.now();
      if (timeUntilWarning <= 0) {
        if (Date.now() < expiry) {
          setOpen(true);
        } else {
          // Already expired — hard reset
          router.push("/login");
        }
        return;
      }
      warningTimerRef.current = setTimeout(() => setOpen(true), timeUntilWarning);
    }

    schedule();
    return () => {
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, [router]);

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
      const result = await extendSessionAction();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setExpiryMs(result.newExpiryMs);
      setOpen(false);
      toast.success("Session extended.");
      // Re-schedule warning for the new expiry
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      const timeUntilWarning = result.newExpiryMs - WARNING_LEAD_MS - Date.now();
      if (timeUntilWarning > 0) {
        warningTimerRef.current = setTimeout(() => setOpen(true), timeUntilWarning);
      }
    });
  }

  function handleLogout() {
    startTransition(async () => {
      await logoutAction();
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
