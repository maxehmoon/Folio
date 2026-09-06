import type {
  RecurrenceFrequency,
  RecurringInvoice,
  RecurringInvoiceLine,
  RecurringInvoiceState,
} from "@/lib/db/types";
import type { InvoiceLineEditorValue } from "@/features/invoices/line-editor-model";

export type RecurringActionState = {
  error?: string;
};

export type RecurringEditorCustomer = {
  avatar_data_url: string | null;
  email: string | null;
  id: string;
  name: string;
};

export type RecurringEditorItem = {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  unit_price_cents: number;
  tax_rate_bps: number;
  currency: string;
};

export type RecurringEditorLine = InvoiceLineEditorValue;

export type RecurringEditorInitialValues = {
  customerId: string;
  frequency: RecurrenceFrequency;
  intervalCount: string;
  startsOn: string;
  endsOn: string;
  paymentTermsDays: string;
  currency: string;
  notes: string;
  paymentInstructions: string;
  lines: RecurringEditorLine[];
};

export type RecurringInvoiceDetail = {
  recurringInvoice: RecurringInvoice;
  lines: RecurringInvoiceLine[];
};

export type RecurringInvoiceListRow = Pick<
  RecurringInvoice,
  | "id"
  | "state"
  | "frequency"
  | "interval_count"
  | "start_date"
  | "end_date"
  | "next_issue_date"
  | "currency"
  | "created_at"
> & {
  customerId: string;
  customerName: string;
  totalCents: number;
  state: RecurringInvoiceState;
};
