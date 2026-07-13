"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Loader2, Shield, ShieldCheck } from "lucide-react";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Status = "loading" | "disabled" | "enrolling" | "enabled";

type Enrolling = { factorId: string; qr: string; secret: string };

/**
 * Real TOTP two-factor management, backed by Supabase Auth's MFA API.
 * Enrollment: `mfa.enroll` → render the QR (built from the returned
 * otpauth URI) → `mfa.challenge` + `mfa.verify` to activate. Disable:
 * `mfa.unenroll`. Status is derived from `mfa.listFactors().totp`
 * (verified TOTP factors only).
 */
export function TwoFactorCard() {
  const [supabase] = useState(() => createSupabaseClient());
  const [status, setStatus] = useState<Status>("loading");
  const [enabledFactorId, setEnabledFactorId] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState<Enrolling | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (!active) return;
      if (error) {
        setStatus("disabled");
        return;
      }
      const verified = data.totp[0];
      if (verified) {
        setEnabledFactorId(verified.id);
        setStatus("enabled");
      } else {
        setStatus("disabled");
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [supabase]);

  async function refreshStatus() {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setStatus("disabled");
      return;
    }
    const verified = data.totp[0];
    setEnabledFactorId(verified?.id ?? null);
    setStatus(verified ? "enabled" : "disabled");
  }

  async function startEnroll() {
    setBusy(true);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (error || !data) {
      setBusy(false);
      toast.error(error?.message || "Could not start 2FA setup.");
      return;
    }
    const qr = await QRCode.toDataURL(data.totp.uri);
    setBusy(false);
    setEnrolling({ factorId: data.id, qr, secret: data.totp.secret });
    setCode("");
    setStatus("enrolling");
  }

  async function verifyEnroll() {
    if (!enrolling) return;
    setBusy(true);
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: enrolling.factorId,
    });
    if (challengeError || !challenge) {
      setBusy(false);
      toast.error(challengeError?.message || "Could not verify the code.");
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: enrolling.factorId,
      challengeId: challenge.id,
      code,
    });
    setBusy(false);
    if (verifyError) {
      toast.error(verifyError.message || "Incorrect code. Try again.");
      return;
    }
    toast.success("Two-factor authentication enabled.");
    setEnrolling(null);
    setCode("");
    await refreshStatus();
  }

  async function cancelEnroll() {
    // Unenroll the just-created (still unverified) factor so it doesn't linger.
    if (enrolling) await supabase.auth.mfa.unenroll({ factorId: enrolling.factorId });
    setEnrolling(null);
    setCode("");
    setStatus("disabled");
  }

  async function disable() {
    if (!enabledFactorId) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: enabledFactorId });
    setBusy(false);
    setDisableOpen(false);
    if (error) {
      toast.error(error.message || "Could not disable 2FA.");
      return;
    }
    toast.success("Two-factor authentication disabled.");
    await refreshStatus();
  }

  const enabled = status === "enabled";

  return (
    <Card className={enabled ? "border-green-200 bg-green-50/30" : "border-amber-200 bg-amber-50/30"}>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base">Two-Factor Authentication</CardTitle>
            <CardDescription>Add an extra layer of security to your account.</CardDescription>
          </div>
          {status === "loading" ? null : enabled ? (
            <Badge className="bg-green-100 text-green-700 border border-green-300">
              <ShieldCheck size={12} className="mr-1" /> Enabled
            </Badge>
          ) : (
            <Badge className="bg-amber-100 text-amber-700 border border-amber-300">
              <Shield size={12} className="mr-1" /> Not enabled
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {status === "loading" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Checking status…
          </div>
        )}

        {status === "disabled" && (
          <Button
            className="rounded-sm bg-amber-500 text-white hover:bg-amber-600"
            onClick={startEnroll}
            disabled={busy}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            Enable Authenticator App
          </Button>
        )}

        {status === "enrolling" && enrolling && (
          <div className="space-y-4 max-w-sm">
            <p className="text-sm text-muted-foreground">
              Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password…),
              then enter the 6-digit code it shows.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={enrolling.qr}
              alt="Two-factor QR code"
              className="w-40 h-40 rounded-lg border border-border/60 bg-white p-1"
            />
            <p className="text-xs text-muted-foreground break-all">
              Can&apos;t scan? Enter this key manually:{" "}
              <span className="font-mono text-foreground">{enrolling.secret}</span>
            </p>
            <Input
              placeholder="000000"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="text-center text-lg tracking-widest rounded-md w-48"
            />
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={cancelEnroll} disabled={busy}>
                Cancel
              </Button>
              <Button
                disabled={code.length !== 6 || busy}
                onClick={verifyEnroll}
                className="bg-accent-orange text-white hover:bg-accent-orange/90"
              >
                {busy && <Loader2 size={14} className="animate-spin mr-1.5" />}
                Verify &amp; Enable
              </Button>
            </div>
          </div>
        )}

        {status === "enabled" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Your account is protected by an authenticator app. You&apos;ll be asked for a code each
              time you sign in.
            </p>
            <Button variant="outline" size="sm" onClick={() => setDisableOpen(true)}>
              Disable two-factor authentication
            </Button>
          </div>
        )}
      </CardContent>

      <AlertDialog open={disableOpen} onOpenChange={(o) => !busy && setDisableOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable two-factor authentication?</AlertDialogTitle>
            <AlertDialogDescription>
              Your account will no longer require a code at sign-in. You can re-enable it at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive-solid"
              onClick={(e) => {
                e.preventDefault();
                disable();
              }}
              disabled={busy}
            >
              {busy && <Loader2 size={14} className="mr-2 animate-spin" />}
              Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
