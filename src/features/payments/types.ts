import type { InvoiceStatus, Payment, PaymentMethod } from "@/lib/db/types";

export type PaymentListRow = Payment & {
  customerId: string | null;
  invoiceNumber: string;
  customerName: string;
};

export type PayableInvoice = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  currency: string;
  balanceDueCents: number;
  status: InvoiceStatus;
};

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  bank_transfer: "Bank transfer",
  card: "Card",
  cash: "Cash",
  cheque: "Cheque",
  other: "Other",
};
