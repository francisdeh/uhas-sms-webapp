import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi, ApiError } from "@/lib/api/server";
import { toFeeItem, toLearnerFee } from "@/features/fees/mappers";
import { FeeItemRoster } from "@/features/fees/components/FeeItemRoster";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AccountantFeeItemDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const api = await getApi();
  let feeItemRead;
  try {
    feeItemRead = await api.fees.getItem(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const roster = await api.fees.listLearnerFeesForItem(id);

  return (
    <FeeItemRoster
      feeItem={toFeeItem(feeItemRead)}
      initialRoster={roster.map(toLearnerFee)}
      backHref="/accountant/fee-items"
    />
  );
}
