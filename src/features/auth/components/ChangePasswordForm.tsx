"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { changePasswordAction } from "@/features/auth/actions/change-password";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldError, FieldGroup } from "@/components/ui/field";

const schema = z
  .object({
    newPassword: z.string().min(8, { message: "Must be at least 8 characters" }),
    confirmPassword: z.string().min(1, { message: "Please confirm your password" }),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

export default function ChangePasswordForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit({ newPassword }: FormValues) {
    const result = await changePasswordAction(newPassword);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Password updated. Welcome!");
    router.push(result.redirect);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FieldGroup className="gap-5">
        <Field>
          <FieldLabel htmlFor="newPassword">New password</FieldLabel>
          <div className="relative">
            <Input
              id="newPassword"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Min. 8 characters"
              className="pr-10"
              {...register("newPassword")}
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
          <FieldError errors={[errors.newPassword]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="confirmPassword">Confirm new password</FieldLabel>
          <Input
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Re-enter password"
            {...register("confirmPassword")}
          />
          <FieldError errors={[errors.confirmPassword]} />
        </Field>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-10 mt-1 bg-accent-orange text-white hover:bg-accent-orange/90 focus-visible:ring-accent-orange/40"
        >
          {isSubmitting && <Loader2 size={15} className="animate-spin mr-2" />}
          {isSubmitting ? "Updating…" : "Set new password"}
        </Button>
      </FieldGroup>
    </form>
  );
}
