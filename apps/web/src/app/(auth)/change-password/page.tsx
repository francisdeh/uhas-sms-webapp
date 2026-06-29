import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import ChangePasswordForm from "@/features/auth/components/ChangePasswordForm";

export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-8 w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-base">U</span>
          </div>
          <div>
            <p className="font-bold text-foreground text-base leading-tight">UHAS Basic School</p>
            <p className="text-xs text-muted-foreground">School Management System</p>
          </div>
        </div>

        <h1 className="text-lg font-semibold text-foreground mb-1">Set a new password</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Your account requires a password change before you can continue.
        </p>

        <ChangePasswordForm />
      </div>
    </div>
  );
}
