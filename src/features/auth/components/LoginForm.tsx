"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signInWithEmailAndPassword } from "firebase/auth";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { loginAction } from "@/features/auth/actions/login";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel, FieldError, FieldGroup } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";

const loginSchema = z.object({
  email: z.email({ message: "Enter a valid email address" }),
  password: z.string().min(1, { message: "Password is required" }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    const saved = localStorage.getItem("uhas_last_email");
    if (saved) setValue("email", saved);
  }, [setValue]);

  async function onSubmit({ email, password }: LoginFormValues) {
    try {
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await user.getIdToken();
      const result = await loginAction(idToken);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      localStorage.setItem("uhas_last_email", email);
      router.push(result.redirect);
      router.refresh();
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      if (
        code === "auth/invalid-credential" ||
        code === "auth/user-not-found" ||
        code === "auth/wrong-password"
      ) {
        toast.error("Incorrect email or password.");
      } else if (code === "auth/too-many-requests") {
        toast.error("Too many failed attempts. Account temporarily locked.");
      } else {
        toast.error("Login failed. Please try again.");
      }
    }
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
            Welcome back
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to your account to continue.
          </p>
        </div>

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

            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pr-10"
                  suppressHydrationWarning
                  {...register("password")}
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
              <FieldError errors={[errors.password]} />
            </Field>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-10 mt-1 bg-accent-orange text-white hover:bg-accent-orange/90 focus-visible:ring-accent-orange/40"
            >
              {isSubmitting && <Loader2 size={15} className="animate-spin mr-2" />}
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </FieldGroup>
        </form>

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
