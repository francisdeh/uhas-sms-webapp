"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";

import { api } from "@/lib/api/browser";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  E164_REGEX,
  classifyIdentifier,
  isLocalNoProviderError,
  normalizePhone,
} from "@/features/auth/phone";

export default function ResetPasswordForm() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseClient(), []);

  const [identifier, setIdentifier] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState("");

  // Phone flow: a fresh sign-in OTP doubles as the recovery mechanism —
  // verifying it authenticates the parent, and /change-password already
  // lets any authenticated session set a new password with no old one
  // required. No backend endpoint needed, same as phone+OTP sign-in.
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null);
  const [otp, setOtp] = useState("");

  const kind = classifyIdentifier(identifier);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const email = identifier.trim();
    if (!email) {
      setError("Enter your email address.");
      return;
    }
    setIsSubmitting(true);
    // Our own backend mints the link via Supabase's admin API and sends
    // our branded email through Brevo/Mailpit instead of Supabase's own
    // mailer. The link still lands on /change-password with a
    // PASSWORD_RECOVERY session that lets them call supabase.auth.updateUser
    // — that part is unchanged.
    //
    // We deliberately don't differentiate success vs failure responses —
    // surfacing "no such email" would leak which addresses are registered.
    // The endpoint itself is enumeration-safe server-side too.
    try {
      await api.auth.resetPassword({ email });
    } catch (err) {
      console.warn("resetPassword:", err);
    }
    setIsSubmitting(false);
    setSentEmail(email);
    setSent(true);
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const phone = normalizePhone(identifier);
    if (!E164_REGEX.test(phone)) {
      setError("Enter a phone number — Ghana local (0200000001) or international (+233...).");
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
    if (!data.user) return;

    toast.success("Verified — set your new password.");
    router.push("/change-password");
    router.refresh();
  }

  function handleBackFromOtp() {
    setOtpSentTo(null);
    setOtp("");
    setError(null);
  }

  if (sent) {
    return (
      <div className="text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-accent-orange/10 flex items-center justify-center">
          <MailCheck size={22} className="text-accent-orange" />
        </div>
        <div>
          <p className="font-semibold text-foreground">Check your inbox</p>
          <p className="text-sm text-muted-foreground mt-1">
            If <span className="font-medium text-foreground">{sentEmail}</span> is registered,
            you&apos;ll receive a reset link shortly.
          </p>
        </div>
        <Link href="/login" className="block text-sm text-accent-orange hover:underline mt-2">
          Back to sign in
        </Link>
      </div>
    );
  }

  if (otpSentTo) {
    return (
      <form onSubmit={handleVerifyOtp}>
        <FieldGroup className="gap-5">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">We sent a 6-digit code to {otpSentTo}.</p>
          </div>

          {error && (
            <div
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </div>
          )}

          <Field>
            <FieldLabel htmlFor="otp">Verification code</FieldLabel>
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={otp} onChange={(v) => setOtp(v)} autoFocus>
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
            variant="brand"
            className="w-full h-10 mt-1"
          >
            {isSubmitting && <Loader2 size={15} className="animate-spin mr-2" />}
            {isSubmitting ? "Verifying…" : "Verify and continue"}
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
    );
  }

  return (
    <form onSubmit={kind === "phone" ? handleSendCode : handleEmailSubmit}>
      <FieldGroup className="gap-5">
        {error && (
          <div
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {error}
          </div>
        )}

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
          {kind === "phone" && (
            <p className="mt-1 text-xs text-muted-foreground">
              We&apos;ll text you a 6-digit verification code — verifying it lets you set a new
              password directly, no email needed.
            </p>
          )}
        </Field>

        <Button
          type="submit"
          variant="brand"
          className="w-full h-10 mt-1"
          disabled={isSubmitting || kind === "unknown"}
        >
          {isSubmitting && <Loader2 size={15} className="animate-spin mr-2" />}
          {isSubmitting ? "Sending…" : kind === "phone" ? "Send verification code" : "Send reset link"}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Remember your password?{" "}
          <Link href="/login" className="text-accent-orange hover:underline">
            Sign in
          </Link>
        </p>
      </FieldGroup>
    </form>
  );
}
