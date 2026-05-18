import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listSchemesAction } from "@/features/schemes/actions";
import { AdminSchemeReview } from "@/features/schemes/components/AdminSchemeReview";

export default async function AdminSchemesPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const [pending, acknowledged] = await Promise.all([
    listSchemesAction({ status: "submitted" }),
    listSchemesAction({ status: "acknowledged" }),
  ]);

  return (
    <AdminSchemeReview
      reviewerId={user.linkedId}
      pending={pending}
      recent={acknowledged.slice(0, 10)}
    />
  );
}
