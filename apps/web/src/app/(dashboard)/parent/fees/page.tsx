import { redirect } from "next/navigation";
import { Wallet, Users } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { toChildFees } from "@/features/fees/mappers";
import { PAID, WAIVED } from "@/features/fees/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LearnerFeeStatusPill } from "@/features/fees/components/LearnerFeeStatusPill";
import { formatCedis } from "@/lib/currency";
import { formatDate } from "@/lib/dates";

export default async function ParentFeesPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const api = await getApi();
  const { children: childRows } = await api.fees.myChildren();
  const children = (childRows ?? []).map(toChildFees);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Fees</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Balances and payment history for your child(ren).
        </p>
      </div>

      {children.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No children linked to your account"
          description="Ask the school office to link your child(ren) to your guardian profile."
        />
      ) : (
        children.map((child) => (
          <Card key={child.studentId}>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <CardTitle className="text-base">
                  {child.studentFirstName} {child.studentLastName}
                </CardTitle>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>
                    Total owed: <span className="font-semibold text-foreground">{formatCedis(child.totalOwedMinor)}</span>
                  </span>
                  <span>
                    Outstanding:{" "}
                    <span className="font-semibold text-foreground">
                      {formatCedis(child.totalOutstandingMinor)}
                    </span>
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {child.fees.length === 0 ? (
                <EmptyState
                  size="compact"
                  icon={Wallet}
                  title="No fees assigned"
                  description="Nothing has been charged to this child yet."
                />
              ) : (
                <div className="space-y-3">
                  {child.fees.map((fee) => (
                    <div key={fee.id} className="rounded-md border border-border/60 p-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{fee.feeItemName}</p>
                          <LearnerFeeStatusPill status={fee.status} />
                        </div>
                        <div className="text-xs text-muted-foreground text-right">
                          <p>
                            {formatCedis(fee.amountMinor)}
                            {fee.status !== PAID &&
                              fee.status !== WAIVED &&
                              ` · Balance: ${formatCedis(fee.balanceMinor)}`}
                          </p>
                          {fee.dueDate && <p>Due {formatDate(fee.dueDate)}</p>}
                        </div>
                      </div>
                      {fee.payments.length > 0 && (
                        <ul className="mt-2 space-y-1 border-t border-border/50 pt-2">
                          {fee.payments.map((p) => (
                            <li
                              key={p.id}
                              className="flex items-center justify-between text-xs text-muted-foreground"
                            >
                              <span>
                                Paid {formatCedis(p.amountMinor)} · {p.method}
                              </span>
                              <span>{formatDate(p.paidAt)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
