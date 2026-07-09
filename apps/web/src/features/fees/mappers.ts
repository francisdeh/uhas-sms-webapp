import type { components } from "@/types/api";
import type { FeeItem, FeePayment, FeesSummary, LearnerFee } from "./types";

export function toFeeItem(f: components["schemas"]["FeeItemRead"]): FeeItem {
  return {
    id: f.id,
    schoolId: f.schoolId,
    name: f.name,
    scope: f.scope,
    scopeRef: f.scopeRef ?? null,
    scopeDisplay: f.scopeDisplay,
    academicYear: f.academicYear,
    term: f.term ?? null,
    amountMinor: f.amountMinor,
    isActive: f.isActive,
    createdAt: f.createdAt ?? null,
    updatedAt: f.updatedAt ?? null,
  };
}

export function toFeePayment(p: components["schemas"]["FeePaymentRead"]): FeePayment {
  return {
    id: p.id,
    learnerFeeId: p.learnerFeeId,
    amountMinor: p.amountMinor,
    method: p.method,
    reference: p.reference ?? null,
    receiptFileUrls: p.receiptFileUrls ?? [],
    recordedById: p.recordedById,
    recordedByName: p.recordedByName,
    paidAt: p.paidAt,
    createdAt: p.createdAt ?? null,
  };
}

export function toLearnerFee(l: components["schemas"]["LearnerFeeRead"]): LearnerFee {
  return {
    id: l.id,
    schoolId: l.schoolId,
    studentId: l.studentId,
    studentFirstName: l.studentFirstName,
    studentLastName: l.studentLastName,
    studentSlug: l.studentSlug,
    feeItemId: l.feeItemId,
    feeItemName: l.feeItemName,
    amountMinor: l.amountMinor,
    status: l.status,
    balanceMinor: l.balanceMinor,
    dueDate: l.dueDate ?? null,
    createdAt: l.createdAt ?? null,
    updatedAt: l.updatedAt ?? null,
    payments: (l.payments ?? []).map(toFeePayment),
  };
}

export function toFeesSummary(s: components["schemas"]["FeesSummary"]): FeesSummary {
  return {
    totalOutstandingMinor: s.totalOutstandingMinor,
    totalCollectedMinor: s.totalCollectedMinor,
    overdueCount: s.overdueCount,
    activeFeeItemsCount: s.activeFeeItemsCount,
  };
}
