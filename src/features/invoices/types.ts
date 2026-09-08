import type {
  Customer,
  Invoice,
  InvoiceLine,
  InvoiceRevision,
  InvoiceStatus,
  Item,
  Payment,
} from "@/lib/db/types";
import type { InvoiceLineEditorValue } from "./line-editor-model";

export type InvoiceListFilter =
  | "all"
  | "draft"
  | "outstanding"
  | "part-paid"
  | "paid"
  | "overdue"
  | "void";

export type InvoiceListRow = Invoice & {
  paidCents: number;
  balanceDueCents: number;
  status: InvoiceStatus;
};

export type InvoiceDetail = {
  revisions?: Array<Omit<InvoiceRevision, "snapshot" | "business_id" | "invoice_id">>;
  invoice: Invoice;
  lines: InvoiceLine[];
  payments: Payment[];
  paidCents: number;
  balanceDueCents: number;
  status: InvoiceStatus;
};

export type InvoiceEditorCustomer = Pick<
  Customer,
  | "id"
  | "name"
  | "email"
  | "tax_id"
  | "default_currency"
  | "avatar_data_url"
>;

export type InvoiceEditorItem = Pick<
  Item,
  | "id"
  | "name"
  | "description"
  | "unit"
  | "unit_price_cents"
  | "tax_rate_bps"
  | "currency"
>;

export type InvoiceEditorLine = InvoiceLineEditorValue;

export type InvoiceEditorInitialValues = {
  customerId: string;
  currency: string;
  issueDate: string;
  dueDate: string;
  exchangeRate: string;
  notes: string;
  paymentInstructions: string;
  lines: InvoiceEditorLine[];
};
