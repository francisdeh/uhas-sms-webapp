import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getPublicSchoolBranding } from "@/features/settings/queries/get-public-school-branding";
import { ROLE_DASHBOARD } from "@/features/auth/types";
import ResetPasswordForm from "@/features/auth/components/ResetPasswordForm";
import { AuthBrandPanel } from "@/features/auth/components/AuthBrandPanel";
import { AuthMobileLogo } from "@/features/auth/components/AuthMobileLogo";
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
            <AuthMobileLogo settings={settings} />

            <div className="mb-7">
              <h2
                className="text-2xl font-bold tracking-tight"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                Reset password
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter your email or phone number to recover access.
              </p>
            </div>

            <ResetPasswordForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
