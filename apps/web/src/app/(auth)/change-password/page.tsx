import ChangePasswordForm from "@/features/auth/components/ChangePasswordForm";

// Deliberately does NOT gate on getSessionUser() here. Supabase's
// invite/recovery links deliver their session as a URL hash fragment
// (`#access_token=...`) that the browser never sends to the server —
// a server-side redirect-if-no-cookie check would bounce every
// freshly-arrived link straight to /login before the client-side
// Supabase browser client ever gets a chance to read the hash and
// establish the session. Supabase itself is the real enforcement
// boundary: ChangePasswordForm's updateUser() call fails cleanly if no
// session was established.
export default function ChangePasswordPage() {
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
