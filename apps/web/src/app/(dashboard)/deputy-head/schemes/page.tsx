import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { getDeputyHeadDivision } from "@/features/students/queries/get-deputy-head-division";
import { AdminSchemeReview } from "@/features/schemes/components/AdminSchemeReview";
import { toScheme } from "@/features/schemes/mappers";
import { Card, CardContent } from "@/components/ui/card";

export default async function DeputyHeadSchemesPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const division = await getDeputyHeadDivision(user.linkedId);
  if (!division) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Schemes of Work / Learning</h1>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No division assigned to your account.
          </CardContent>
        </Card>
      </div>
    );
  }

  const api = await getApi();
  const [pendingResp, acknowledgedResp] = await Promise.all([
    api.schemes.list({ division, status: "submitted", size: 100 }),
    api.schemes.list({ division, status: "acknowledged", size: 100 }),
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
