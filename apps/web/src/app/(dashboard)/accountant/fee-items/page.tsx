import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { getCurrentAcademicYear, getAcademicYearOptions } from "@/lib/academic-year-server";
import { toFeeItem } from "@/features/fees/mappers";
import { FeeItemsTable } from "@/features/fees/components/FeeItemsTable";

export default async function AccountantFeeItemsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const api = await getApi();
  const [res, currentYear, yearOptions] = await Promise.all([
    api.fees.listItems({ size: 200 }),
    getCurrentAcademicYear(),
    getAcademicYearOptions(),
  ]);

  return (
    <FeeItemsTable
      initialData={{ ...res, items: res.items.map(toFeeItem) }}
      baseHref="/accountant/fee-items"
      currentYear={currentYear}
      yearOptions={yearOptions}
    />
  );
}
