import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { AdminSchemeReview } from "@/features/schemes/components/AdminSchemeReview";
import { toScheme } from "@/features/schemes/mappers";

export default async function AdminSchemesPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const api = await getApi();
  const [pendingResp, acknowledgedResp] = await Promise.all([
    api.schemes.list({ status: "submitted", size: 100 }),
    api.schemes.list({ status: "acknowledged", size: 100 }),
  ]);
  const pending = pendingResp.items.map(toScheme);
  const acknowledged = acknowledgedResp.items.map(toScheme);

  return (
    <AdminSchemeReview
      reviewerId={user.linkedId}
      pending={pending}
      recent={acknowledged.slice(0, 10)}
    />
  );
}
