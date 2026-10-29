import { z } from 'zod';

/** Money is exchanged as integer grosze (1 PLN = 100) to avoid floating-point errors. */
export const CURRENCY = 'PLN';

export const PAYMENT_METHODS = ['cash', 'transfer', 'blik', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Gotówka',
  transfer: 'Przelew',
  blik: 'BLIK',
  other: 'Inna',
};

export const LEDGER_KINDS = ['charge', 'payment', 'adjustment'] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

const grosze = z.number().int();
const positiveGrosze = grosze.min(1, 'Kwota musi być dodatnia').max(10_000_000);
const isoDate = z.iso.datetime({ offset: true });
export const monthSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Format RRRR-MM'),
});

export const rateSchema = z.object({ hourlyRate: grosze.min(0).max(10_000_000) });

export const packageSchema = z.object({
  lessons: z.number().int().min(1).max(100),
  price: positiveGrosze,
  note: z.string().trim().max(200).optional(),
});

export const paymentSchema = z.object({
  amount: positiveGrosze,
  method: z.enum(PAYMENT_METHODS),
  paidAt: isoDate.optional(),
  note: z.string().trim().max(200).optional(),
});

export const adjustmentSchema = z.object({
  /** Positive increases what the student owes, negative reduces it. */
  amount: grosze
    .min(-10_000_000)
    .max(10_000_000)
    .refine((v) => v !== 0, 'Kwota nie może być zerowa'),
  note: z.string().trim().min(3, 'Opisz korektę').max(200),
});

export interface LedgerEntryInfo {
  id: string;
  kind: LedgerKind;
  /** Signed: + increases debt (charges), − reduces it (payments). */
  amount: number;
  description: string;
  occurredAt: string;
  lessonId: string | null;
  voided: boolean;
}

export interface PackageInfo {
  id: string;
  lessonsTotal: number;
  lessonsUsed: number;
  price: number;
  purchasedAt: string;
  note: string | null;
}

export interface BillingAccount {
  enrollmentId: string;
  student: string;
  tutor: string;
  subject: string;
  hourlyRate: number | null;
  /** Positive = student owes, negative = overpaid. */
  balance: number;
  packages: PackageInfo[];
  entries: LedgerEntryInfo[];
}

export interface BalanceRow {
  enrollmentId: string;
  student: string;
  tutor: string;
  subject: string;
  charged: number;
  paid: number;
  balance: number;
}

export interface EarningsSummary {
  month: string;
  /** Payments received in the month. */
  received: number;
  /** Charges for lessons and packages in the month. */
  charged: number;
  /** Total outstanding across students (now). */
  outstanding: number;
  lessonsCompleted: number;
  rows: BalanceRow[];
  /** Received per month for the last 6 months, oldest first. */
  history: { month: string; received: number; charged: number }[];
}

export interface Statement {
  month: string;
  enrollmentId: string;
  student: string;
  tutor: string;
  subject: string;
  opening: number;
  closing: number;
  entries: LedgerEntryInfo[];
}
