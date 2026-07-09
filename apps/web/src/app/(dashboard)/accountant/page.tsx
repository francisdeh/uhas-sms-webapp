import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ClipboardList, Wallet, Landmark, ArrowRight } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { toFeesSummary } from "@/features/fees/mappers";
import { formatCedis } from "@/lib/currency";
import { Card, CardContent } from "@/components/ui/card";

export default async function AccountantPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const api = await getApi();
  const summary = toFeesSummary(await api.fees.summary());

  const cards = [
    {
      label: "Outstanding balance",
      value: formatCedis(summary.totalOutstandingMinor),
      icon: Wallet,
      iconBg: "bg-amber-500/10 text-amber-600",
    },
    {
      label: "Collected",
      value: formatCedis(summary.totalCollectedMinor),
      icon: Landmark,
      iconBg: "bg-emerald-500/10 text-emerald-600",
    },
    {
      label: "Overdue fees",
      value: String(summary.overdueCount),
      icon: AlertTriangle,
      iconBg: "bg-rose-500/10 text-rose-600",
    },
    {
      label: "Active fee items",
      value: String(summary.activeFeeItemsCount),
      icon: ClipboardList,
      iconBg: "bg-blue-500/10 text-blue-600",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Accountant — Welcome, {user.displayName}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          A snapshot of fee balances across the school.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-5">
              <div
                className={`w-9 h-9 rounded-lg ${card.iconBg} flex items-center justify-center mb-3`}
              >
                <card.icon size={16} />
              </div>
              <p className="text-2xl font-bold tabular-nums">{card.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{card.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/accountant/fee-items">
          <Card className="hover:shadow-md transition-shadow cursor-pointer group">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Fee items</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Define fees and assign them to learners.
                </p>
              </div>
              <ArrowRight
                size={14}
                className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </CardContent>
          </Card>
        </Link>
        <Link href="/accountant/balances">
          <Card className="hover:shadow-md transition-shadow cursor-pointer group">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Balances</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  See every learner&apos;s balance, filter by status.
                </p>
              </div>
              <ArrowRight
                size={14}
                className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
