import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import ChangePasswordForm from "@/features/auth/components/ChangePasswordForm";

export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F5F7] px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-[#1E293B] flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-base">U</span>
          </div>
          <div>
            <p className="font-bold text-[#1E293B] text-base leading-tight">UHAS Basic School</p>
            <p className="text-xs text-gray-400">School Management System</p>
          </div>
        </div>

        <h1 className="text-lg font-semibold text-gray-800 mb-1">Set a new password</h1>
        <p className="text-sm text-gray-400 mb-6">
          Your account requires a password change before you can continue.
        </p>

        <ChangePasswordForm />
      </div>
    </div>
  );
}
