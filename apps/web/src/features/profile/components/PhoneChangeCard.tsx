"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { normalizeGhanaPhone } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { api, ApiError } from "@/lib/api/browser";

interface PhoneChangeCardProps {
  currentPhone: string | null;
  /** Only Parent accounts can sign in via phone-OTP (see LoginForm.tsx) —
   *  every other role's phone is contact/SMS-notification only. Changes
   *  the helper copy below so staff aren't told a number is "login-usable"
   *  when it isn't. */
  usedForLogin: boolean;
}

/** Same allowance LoginForm.tsx makes for local dev/test — Supabase's
 * phone provider isn't configured outside a real project, but test_otp
 * still lets verifyOtp succeed with the pinned code. */
function isLocalNoProviderError(message: string): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return /unsupported phone provider|no sms provider/i.test(message);
}

export function PhoneChangeCard({ currentPhone, usedForLogin }: PhoneChangeCardProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseClient(), []);

  const [editing, setEditing] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  function reset() {
    setEditing(false);
    setNewPhone("");
    setOtpSentTo(null);
    setOtp("");
  }

  async function handleSendCode() {
    const normalized = normalizeGhanaPhone(newPhone);
    if (!normalized) {
      toast.error("Enter a Ghana phone number, e.g. 0244000000 or +233244000000.");
      return;
    }
    setSending(true);
    const { error } = await supabase.auth.updateUser({ phone: normalized });
    setSending(false);

    if (error && !isLocalNoProviderError(error.message)) {
      toast.error(error.message || "Couldn't send a verification code.");
      return;
    }
    setOtpSentTo(normalized);
    if (error) {
      toast.message("Using test code (dev mode). Enter the configured OTP below.");
    } else {
      toast.success("Verification code sent.");
    }
  }

  async function handleVerifyCode() {
    if (!otpSentTo || otp.length !== 6) return;
    setVerifying(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone: otpSentTo,
      token: otp,
      type: "phone_change",
    });
    if (verifyError) {
      setVerifying(false);
      toast.error(verifyError.message || "Incorrect or expired code. Try again.");
      return;
    }

    try {
      await api.me.confirmPhone();
      toast.success("Phone number updated.");
      reset();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save the new number.");
    } finally {
      setVerifying(false);
    }
  }

  if (!editing) {
    return (
      <Field>
        <FieldLabel htmlFor="phone">Phone Number</FieldLabel>
        <div className="flex items-center gap-2">
          <Input
            id="phone"
            value={currentPhone || "Not set"}
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

  if (!otpSentTo) {
    return (
      <Field>
        <FieldLabel htmlFor="newPhone">New Phone Number</FieldLabel>
        <div className="flex items-center gap-2">
          <Input
            id="newPhone"
            type="tel"
            inputMode="tel"
            placeholder="0244 000 000"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
          />
          <Button type="button" size="sm" onClick={handleSendCode} disabled={sending}>
            {sending && <Loader2 size={13} className="animate-spin mr-1.5" />}
            Send code
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            Cancel
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {usedForLogin
            ? "We'll text a 6-digit code to the new number before it becomes login-usable."
            : "We'll text a 6-digit code to confirm the new number. It's used for contact and SMS notifications only — not for signing in."}
        </p>
      </Field>
    );
  }

  return (
    <Field>
      <FieldLabel htmlFor="phoneOtp">Verification Code</FieldLabel>
      <p className="text-xs text-muted-foreground mb-2">We sent a 6-digit code to {otpSentTo}.</p>
      <div className="flex items-center gap-2">
        <InputOTP maxLength={6} value={otp} onChange={setOtp}>
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
        <Button
          type="button"
          size="sm"
          onClick={handleVerifyCode}
          disabled={verifying || otp.length !== 6}
        >
          {verifying && <Loader2 size={13} className="animate-spin mr-1.5" />}
          Verify
        </Button>
      </div>
      <button
        type="button"
        onClick={reset}
        className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={12} />
        Use a different number
      </button>
    </Field>
  );
}
