"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldError, FieldGroup } from "@/components/ui/field";
import { ImageUploadField } from "@/features/uploads/components/ImageUploadField";
import { updateIdentityAction } from "@/features/settings/actions";
import type { SchoolSettings } from "@/features/settings/types";

const schema = z.object({
  name: z.string().min(2, { message: "School name is required." }),
  motto: z.string().max(255).optional(),
  address: z.string().max(500).optional(),
  phone: z.string().max(50).optional(),
  email: z
    .email({ message: "Enter a valid email." })
    .max(255)
    .optional()
    .or(z.literal("")),
  principalName: z.string().max(255).optional(),
});

type Values = z.infer<typeof schema>;

export function IdentityTab({ settings }: { settings: SchoolSettings }) {
  const router = useRouter();
  const [logoUrl, setLogoUrl] = useState<string | null>(settings.logoUrl);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: settings.name,
      motto: settings.motto ?? "",
      address: settings.address ?? "",
      phone: settings.phone ?? "",
      email: settings.email ?? "",
      principalName: settings.principalName ?? "",
    },
  });

  async function onSubmit(values: Values) {
    const result = await updateIdentityAction({ ...values, logoUrl });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("School identity updated.");
    router.refresh();
  }

  async function onLogoChange(next: string | null) {
    setLogoUrl(next);
    // Persist immediately so the upload doesn't depend on Save Changes.
    const result = await updateIdentityAction({
      name: settings.name,
      motto: settings.motto,
      address: settings.address,
      phone: settings.phone,
      email: settings.email ?? "",
      principalName: settings.principalName,
      logoUrl: next,
    });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(next ? "Logo updated." : "Logo removed.");
    router.refresh();
  }

  return (
    <Card className="rounded-t-none border-t-0">
      <CardHeader>
        <CardTitle className="text-base">School Identity</CardTitle>
        <CardDescription>
          Name, contact details, and logo. The logo appears on the login page, sidebar, and report cards.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-6 max-w-sm">
          <ImageUploadField
            ownerId={settings.id}
            kind="school/logo"
            value={logoUrl}
            onChange={onLogoChange}
            label="School logo"
          />
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <FieldGroup className="gap-4 max-w-xl">
            <Field>
              <FieldLabel htmlFor="name">School Name</FieldLabel>
              <Input id="name" {...register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="motto">Motto / Tagline</FieldLabel>
              <Input id="motto" placeholder="e.g. Knowledge for Service" {...register("motto")} />
              <FieldError errors={[errors.motto]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="address">Address</FieldLabel>
              <Textarea
                id="address"
                rows={2}
                placeholder="Street, town, region"
                {...register("address")}
              />
              <FieldError errors={[errors.address]} />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="phone">Phone</FieldLabel>
                <Input id="phone" placeholder="+233 24 000 0000" {...register("phone")} />
                <FieldError errors={[errors.phone]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="info@school.edu.gh"
                  {...register("email")}
                />
                <FieldError errors={[errors.email]} />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="principalName">Head of School</FieldLabel>
              <Input id="principalName" {...register("principalName")} />
              <FieldError errors={[errors.principalName]} />
            </Field>

            <div>
              <Button type="submit" disabled={isSubmitting} variant="ink">
                {isSubmitting && <Loader2 size={14} className="animate-spin mr-2" />}
                Save Identity
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
