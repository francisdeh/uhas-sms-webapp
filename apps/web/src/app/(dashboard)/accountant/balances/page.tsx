import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { toLearnerFee } from "@/features/fees/mappers";
import { BalancesTable } from "@/features/fees/components/BalancesTable";

export default async function AccountantBalancesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const api = await getApi();
  const res = await api.fees.listLearnerFees({ size: 200 });

  return <BalancesTable initialData={{ ...res, items: res.items.map(toLearnerFee) }} />;
}
