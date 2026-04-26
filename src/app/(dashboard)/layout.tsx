import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { DashboardLayout } from "@/features/shell/components/DashboardLayout";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");

  return <DashboardLayout user={user}>{children}</DashboardLayout>;
}
