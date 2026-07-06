"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

/**
 * Standalone step-up challenge, shown when the proxy catches an enrolled
 * user still at `aal1` on a dashboard route (e.g. they abandoned the
 * login-form challenge and navigated directly). Verifies the TOTP code,
 * which lifts the session to `aal2`, then bounces to `/` — the proxy
 * routes them to their dashboard now that step-up is satisfied.
 */
export function VerifyTwoFactorForm() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseClient(), []);

  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [preparing, setPreparing] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    async function prepare() {
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      const factor = factors?.totp[0];
      if (!active) return;
      if (factorsError || !factor) {
        // No verified factor — nothing to step up. Let the proxy route
        // them normally.
        router.replace("/");
        return;
      }
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: factor.id,
      });
      if (!active) return;
      if (challengeError || !challenge) {
        toast.error(challengeError?.message || "Couldn't start verification. Please sign in again.");
        return;
      }
      setFactorId(factor.id);
      setChallengeId(challenge.id);
      setPreparing(false);
    }
    prepare();
    return () => {
      active = false;
    };
  }, [supabase, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || !challengeId || code.length !== 6) return;
    setSubmitting(true);
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
    setSubmitting(false);
    if (error) {
      toast.error(error.message || "Incorrect code. Try again.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      <FieldGroup className="gap-5">
        <Field>
          <FieldLabel htmlFor="mfa">Authenticator code</FieldLabel>
          <div className="flex justify-center">
            <InputOTP
              maxLength={6}
              value={code}
              onChange={(v) => setCode(v)}
              disabled={preparing}
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
          disabled={preparing || submitting || code.length !== 6}
          className="w-full h-10 bg-accent-orange text-white hover:bg-accent-orange/90 focus-visible:ring-accent-orange/40"
        >
          {(preparing || submitting) && <Loader2 size={15} className="animate-spin mr-2" />}
          {submitting ? "Verifying…" : "Verify"}
        </Button>

        <button
          type="button"
          onClick={signOut}
          className="mx-auto text-xs text-muted-foreground hover:text-foreground"
        >
          Sign out
        </button>
      </FieldGroup>
    </form>
  );
}
