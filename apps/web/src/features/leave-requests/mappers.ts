import type { components } from "@/types/api";
import type { LeaveBalance, LeaveRequest } from "@/features/attendance/types";

export function toLeaveRequest(r: components["schemas"]["LeaveRequestRead"]): LeaveRequest {
  return {
    id: r.id,
    schoolId: r.schoolId,
    staffId: r.staffId,
    staffName: `${r.staffFirstName} ${r.staffLastName}`.trim(),
    type: r.type,
    startDate: r.startDate,
    endDate: r.endDate,
    reason: r.reason ?? null,
    status: r.status,
    approvedById: r.approvedById ?? null,
    approvedByName: r.approvedByName ?? null,
    rejectionReason: r.rejectionReason ?? null,
    substituteStaffId: r.substituteStaffId ?? null,
    substituteStaffName: r.substituteStaffName ?? null,
    documentUrls: r.documentUrls ?? [],
    createdAt: r.createdAt ?? null,
  };
}

export function toLeaveBalance(b: components["schemas"]["LeaveBalanceRead"]): LeaveBalance {
  return {
    staffId: b.staffId,
    entitlementDays: b.entitlementDays,
    usedDays: b.usedDays,
    remainingDays: b.remainingDays,
  };
}
