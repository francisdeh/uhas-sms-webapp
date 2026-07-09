export type FeeScope = "school" | "division" | "class";

// Mirrors app/features/fees/constants.py.
export const SCHOOL_SCOPE: FeeScope = "school";
export const DIVISION_SCOPE: FeeScope = "division";
export const CLASS_SCOPE: FeeScope = "class";

export type LearnerFeeStatus = "outstanding" | "partial" | "paid" | "waived";

export const OUTSTANDING: LearnerFeeStatus = "outstanding";
export const PARTIAL: LearnerFeeStatus = "partial";
export const PAID: LearnerFeeStatus = "paid";
export const WAIVED: LearnerFeeStatus = "waived";

export const LEARNER_FEE_STATUS_LABELS: Record<LearnerFeeStatus, string> = {
  outstanding: "Outstanding",
  partial: "Partial",
  paid: "Paid",
  waived: "Waived",
};

export type PaymentMethod = "cash" | "momo" | "bank" | "cheque";

export const CASH: PaymentMethod = "cash";
export const MOMO: PaymentMethod = "momo";
export const BANK: PaymentMethod = "bank";
export const CHEQUE: PaymentMethod = "cheque";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  momo: "Mobile Money",
  bank: "Bank",
  cheque: "Cheque",
};

export type FeeItem = {
  id: string;
  schoolId: string;
  name: string;
  scope: FeeScope;
  scopeRef: string | null;
  scopeDisplay: string;
  academicYear: string;
  term: number | null;
  amountMinor: number;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type FeePayment = {
  id: string;
  learnerFeeId: string;
  amountMinor: number;
  method: PaymentMethod;
  reference: string | null;
  receiptFileUrls: string[];
  recordedById: string;
  recordedByName: string;
  paidAt: string;
  createdAt: string | null;
};

export type LearnerFee = {
  id: string;
  schoolId: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string;
  studentSlug: string;
  feeItemId: string;
  feeItemName: string;
  amountMinor: number;
  status: LearnerFeeStatus;
  balanceMinor: number;
  dueDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  payments: FeePayment[];
};

export type FeesSummary = {
  totalOutstandingMinor: number;
  totalCollectedMinor: number;
  overdueCount: number;
  activeFeeItemsCount: number;
};

export type CreateFeeItemInput = {
  name: string;
  scope: FeeScope;
  scopeRef?: string;
  academicYear: string;
  term?: number;
  amountMinor: number;
};

export type UpdateFeeItemInput = {
  name?: string;
  amountMinor?: number;
  isActive?: boolean;
};

export type UpdateLearnerFeeInput = {
  amountMinor?: number;
  dueDate?: string;
};

export type RecordPaymentInput = {
  amountMinor: number;
  method: PaymentMethod;
  reference?: string;
  paidAt?: string;
  receiptFileUrls?: string[];
};
