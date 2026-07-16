import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getPublicSchoolBranding } from "@/features/settings/queries/get-public-school-branding";
import { ROLE_DASHBOARD } from "@/features/auth/types";
import LoginForm from "@/features/auth/components/LoginForm";
import { AuthBrandPanel } from "@/features/auth/components/AuthBrandPanel";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(ROLE_DASHBOARD[user.role]);
  const settings = await getPublicSchoolBranding();

  return (
    <div className="min-h-screen flex">
      <AuthBrandPanel settings={settings} />

      <div className="flex-1 flex items-center justify-center bg-background px-6 py-12">
        <LoginForm settings={settings} />
      </div>
    </div>
  );
}
