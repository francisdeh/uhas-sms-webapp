import Image from "next/image";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getPublicSchoolBranding } from "@/features/settings/queries/get-public-school-branding";
import { ROLE_DASHBOARD } from "@/features/auth/types";
import ResetPasswordForm from "@/features/auth/components/ResetPasswordForm";
import { AuthBrandPanel } from "@/features/auth/components/AuthBrandPanel";
import { Card, CardContent } from "@/components/ui/card";

export default async function ResetPasswordPage() {
  const user = await getSessionUser();
  if (user) redirect(ROLE_DASHBOARD[user.role]);
  const settings = await getPublicSchoolBranding();

  return (
    <div className="min-h-screen flex">
      <AuthBrandPanel settings={settings} />

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center bg-background px-6 py-12">
        <Card className="w-full max-w-md shadow-md border-t-2 border-t-accent-orange">
          <CardContent className="px-8 py-8">
            {/* Mobile-only logo */}
            <div className="lg:hidden flex items-center gap-2.5 mb-8">
              <Image src="/logo.png" alt="UHAS Basic School" width={32} height={32} className="rounded-full" />
              <div>
                <p className="text-sm font-semibold leading-tight">UHAS Basic School</p>
                <p className="text-xs text-muted-foreground">Management System</p>
              </div>
            </div>

            <div className="mb-7">
              <h2
                className="text-2xl font-bold tracking-tight"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                Reset password
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter your email and we&apos;ll send you a reset link.
              </p>
            </div>

            <ResetPasswordForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
