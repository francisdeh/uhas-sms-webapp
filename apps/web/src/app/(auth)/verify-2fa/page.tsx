import { VerifyTwoFactorForm } from "@/features/auth/components/VerifyTwoFactorForm";

// Reached only via the proxy's step-up gate — an authenticated user with
// a verified TOTP factor who hasn't cleared it this session. The gate
// (proxy.ts) already guarantees a session exists; the form itself is the
// enforcement, verifying the code before the session reaches aal2.
export default function VerifyTwoFactorPage() {
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

        <h1 className="text-lg font-semibold text-foreground mb-1">Two-step verification</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Enter the 6-digit code from your authenticator app to finish signing in.
        </p>

        <VerifyTwoFactorForm />
      </div>
    </div>
  );
}
