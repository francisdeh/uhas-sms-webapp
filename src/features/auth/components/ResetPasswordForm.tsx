"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, MailCheck } from "lucide-react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldError, FieldGroup } from "@/components/ui/field";

const schema = z.object({
  email: z.email({ message: "Enter a valid email address" }),
});

type FormValues = z.infer<typeof schema>;

export default function ResetPasswordForm() {
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit({ email }: FormValues) {
    // Firebase sends the email from its servers using its own template.
    // We don't await success vs failure differently — to avoid leaking
    // which addresses are registered, we always show the same "check your
    // inbox" message regardless of outcome.
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      // Swallow auth/user-not-found etc — we deliberately don't surface them.
      console.warn("sendPasswordResetEmail:", err);
    }
    setSentEmail(email);
    setSent(true);
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
        <Link
          href="/login"
          className="block text-sm text-accent-orange hover:underline mt-2"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FieldGroup className="gap-5">
        <Field>
          <FieldLabel htmlFor="email">Email address</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@uhas.edu.gh"
            suppressHydrationWarning
            {...register("email")}
          />
          <FieldError errors={[errors.email]} />
        </Field>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-10 mt-1 bg-accent-orange text-white hover:bg-accent-orange/90 focus-visible:ring-accent-orange/40"
        >
          {isSubmitting && <Loader2 size={15} className="animate-spin mr-2" />}
          {isSubmitting ? "Sending…" : "Send reset link"}
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
