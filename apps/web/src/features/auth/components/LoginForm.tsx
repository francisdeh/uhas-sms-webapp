"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { User as SupabaseUser } from "@supabase/supabase-js";

import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel, FieldError, FieldGroup } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ROLE_DASHBOARD, USER_ROLES, type UserRole } from "@/features/auth/types";

// E.164: leading `+`, 1-9 country code, total digits 7-15.
const E164_REGEX = /^\+[1-9]\d{6,14}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Ghana default — covers local 0XX-XXX-XXXX entries that aren't E.164.
// Configurable later when other countries enroll.
const DEFAULT_COUNTRY_CODE = "233";

type IdentifierKind = "email" | "phone" | "unknown";

/**
 * Normalise the user's input into E.164.
 *
 *   "+233200000001"         → "+233200000001"
 *   "0200000001"            → "+233200000001"  (Ghana local → drop 0, add +233)
 *   "00233 200 000 001"     → "+233200000001"  (00 prefix is intl-out)
 *   "233200000001"          → "+233200000001"  (missing the +)
 *   "+1 (555) 123-4567"     → "+15551234567"   (foreign with formatting)
 *
 * Returns empty string for clearly-non-phone input (e.g. contains `@`).
 */
export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  if (!trimmed || trimmed.includes("@")) return "";

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D+/g, "");
  if (!digits) return "";

  if (hasPlus) return `+${digits}`;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("0")) return `+${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`;
  return `+${digits}`;
}

function classify(input: string): IdentifierKind {
  const v = input.trim();
  if (!v) return "unknown";
  if (EMAIL_REGEX.test(v)) return "email";
  // Anything that looks like a phone-in-progress — leading `+`, leading `0`,
  // or all-digits-with-formatting — switches the form into phone mode.
  // Strict E.164 validation runs at submit.
  if (/^\+/.test(v)) return "phone";
  if (/^[\d\s()+\-.]+$/.test(v) && /\d/.test(v)) return "phone";
  return "unknown";
}

/**
 * In production, signInWithOtp triggers an SMS send via the configured
 * provider. Locally, the Twilio block has env-substituted (empty) creds
 * and Supabase returns "Unsupported phone provider" — but test_otp still
 * lets verifyOtp succeed with a pinned code. We treat that specific
 * error as expected in non-prod so dev/test flows still work.
 */
function isLocalNoProviderError(message: string): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return /unsupported phone provider|no sms provider/i.test(message);
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseClient(), []);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // After "Send code" succeeds, we lock the phone so verifyOtp targets the
  // same number even if the user edits the input mid-flow.
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null);
  const [otp, setOtp] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const kind = classify(identifier);
  const stage: "identifier" | "otp" = otpSentTo ? "otp" : "identifier";

  // Restore the last used identifier on mount.
  useEffect(() => {
    const saved = localStorage.getItem("uhas_last_identifier");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setIdentifier(saved);
  }, []);

  // Surface proxy.ts redirect reasons (e.g., role not configured).
  useEffect(() => {
    const reason = searchParams.get("reason");
    if (reason === "no_role") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("Your account is signed in but isn't fully set up. Contact your administrator.");
    }
  }, [searchParams]);

  async function applyAuthedUserOrSignOut(user: SupabaseUser) {
    const role = user.app_metadata?.role as UserRole | undefined;
    if (!role || !USER_ROLES.includes(role)) {
      toast.error("Account not configured. Contact your administrator.");
      await supabase.auth.signOut();
      return;
    }
    const mustChange = Boolean(user.user_metadata?.must_change_password);
    localStorage.setItem("uhas_last_identifier", identifier.trim());
    router.push(mustChange ? "/change-password" : ROLE_DASHBOARD[role]);
    router.refresh();
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!password) {
      setError("Password is required.");
      return;
    }
    setIsSubmitting(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: identifier.trim(),
      password,
    });
    setIsSubmitting(false);

    if (signInError) {
      if (signInError.code === "invalid_credentials") {
        toast.error("Incorrect email or password.");
      } else if (signInError.code === "email_not_confirmed") {
        toast.error("Your email isn't confirmed yet. Check your inbox.");
      } else if (signInError.code === "over_request_rate_limit") {
        toast.error("Too many attempts. Try again in a few minutes.");
      } else {
        toast.error("Login failed. Please try again.");
      }
      return;
    }
    if (data.user) await applyAuthedUserOrSignOut(data.user);
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const phone = normalizePhone(identifier);
    if (!E164_REGEX.test(phone)) {
      setError(
        "Enter a phone number — Ghana local (0200000001) or international (+233...).",
      );
      return;
    }
    setIsSubmitting(true);
    const { error: sendError } = await supabase.auth.signInWithOtp({ phone });
    setIsSubmitting(false);

    if (sendError && !isLocalNoProviderError(sendError.message)) {
      toast.error(sendError.message || "Couldn't send verification code.");
      return;
    }
    setOtpSentTo(phone);
    if (sendError) {
      toast.message("Using test code (dev mode). Enter the configured OTP below.");
    } else {
      toast.success("Verification code sent.");
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (otp.length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    if (!otpSentTo) return;

    setIsSubmitting(true);
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      phone: otpSentTo,
      token: otp,
      type: "sms",
    });
    setIsSubmitting(false);

    if (verifyError) {
      if (verifyError.code === "otp_expired" || /expired/i.test(verifyError.message)) {
        toast.error("Code expired. Request a new one.");
      } else {
        toast.error("Incorrect or expired code. Try again.");
      }
      return;
    }
    if (data.user) await applyAuthedUserOrSignOut(data.user);
  }

  function handleBackFromOtp() {
    setOtpSentTo(null);
    setOtp("");
    setError(null);
  }

  return (
    <Card className="w-full max-w-md shadow-md border-t-2 border-t-accent-orange">
      <CardContent className="px-8 py-8">
        {/* Mobile-only logo */}
        <div className="lg:hidden flex items-center gap-2.5 mb-8">
          <Image
            src="/logo.png"
            alt="UHAS Basic School"
            width={32}
            height={32}
            className="rounded-full"
          />
          <div>
            <p className="text-sm font-semibold leading-tight">UHAS Basic School</p>
            <p className="text-xs text-muted-foreground">Management System</p>
          </div>
        </div>

        {/* Heading */}
        <div className="mb-7">
          <h2
            className="text-2xl font-bold tracking-tight"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            {stage === "otp" ? "Enter verification code" : "Welcome back"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {stage === "otp"
              ? `We sent a 6-digit code to ${otpSentTo}.`
              : "Sign in to your account to continue."}
          </p>
        </div>

        {error && (
          <div
            className="mb-5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {error}
          </div>
        )}

        {stage === "identifier" && kind !== "phone" && (
          <form onSubmit={handleEmailSubmit}>
            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel htmlFor="identifier">Email or phone number</FieldLabel>
                <Input
                  id="identifier"
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  placeholder="you@uhas.edu.gh  or  +233..."
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  suppressHydrationWarning
                />
              </Field>

              {kind === "email" && (
                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="pr-10"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      suppressHydrationWarning
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-transparent"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </Button>
                  </div>
                  <FieldError errors={[]} />
                </Field>
              )}

              <Button
                type="submit"
                disabled={isSubmitting || kind === "unknown"}
                className="w-full h-10 mt-1 bg-accent-orange text-white hover:bg-accent-orange/90 focus-visible:ring-accent-orange/40"
              >
                {isSubmitting && <Loader2 size={15} className="animate-spin mr-2" />}
                {isSubmitting ? "Signing in…" : "Sign in"}
              </Button>
            </FieldGroup>
          </form>
        )}

        {stage === "identifier" && kind === "phone" && (
          <form onSubmit={handleSendCode}>
            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel htmlFor="identifier">Email or phone number</FieldLabel>
                <Input
                  id="identifier"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0200000001  or  +233200000001"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  suppressHydrationWarning
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  We&apos;ll text you a 6-digit verification code.
                </p>
              </Field>

              <Button
                type="submit"
                disabled={isSubmitting || !E164_REGEX.test(normalizePhone(identifier))}
                className="w-full h-10 mt-1 bg-accent-orange text-white hover:bg-accent-orange/90 focus-visible:ring-accent-orange/40"
              >
                {isSubmitting && <Loader2 size={15} className="animate-spin mr-2" />}
                {isSubmitting ? "Sending…" : "Send verification code"}
              </Button>
            </FieldGroup>
          </form>
        )}

        {stage === "otp" && (
          <form onSubmit={handleVerifyOtp}>
            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel htmlFor="otp">Verification code</FieldLabel>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={otp}
                    onChange={(v) => setOtp(v)}
                    autoFocus
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
              </Field>

              <Button
                type="submit"
                disabled={isSubmitting || otp.length !== 6}
                className="w-full h-10 mt-1 bg-accent-orange text-white hover:bg-accent-orange/90 focus-visible:ring-accent-orange/40"
              >
                {isSubmitting && <Loader2 size={15} className="animate-spin mr-2" />}
                {isSubmitting ? "Verifying…" : "Verify and sign in"}
              </Button>

              <button
                type="button"
                onClick={handleBackFromOtp}
                className="mx-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft size={12} />
                Use a different phone or email
              </button>
            </FieldGroup>
          </form>
        )}

        <Separator className="my-6" />

        <p className="text-center text-xs text-muted-foreground">
          <Link href="/reset-password" className="text-accent-orange hover:underline">
            Forgot password?
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
