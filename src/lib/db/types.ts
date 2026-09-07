import type {
  ColumnType,
  Insertable,
  Selectable,
  Updateable,
} from "kysely";

type AuthDate = ColumnType<Date, Date | string, Date | string>;
type AuthBoolean = ColumnType<boolean, boolean | number, boolean | number>;

export type InvoiceLifecycle = "draft" | "issued" | "void";
export type InvoiceStatus =
  | "draft"
  | "issued"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "void";
export type PaymentMethod =
  | "bank_transfer"
  | "card"
  | "cash"
  | "cheque"
  | "other";
export type RecurrenceFrequency = "day" | "week" | "month" | "year";
export type RecurringInvoiceState = "active" | "paused" | "ended";
export type RecurringRunStatus = "pending" | "completed" | "failed" | "skipped";

export interface AuthUserTable {
  id: string;
  name: string;
  email: string;
  email_verified: AuthBoolean;
  image: string | null;
  created_at: AuthDate;
  updated_at: AuthDate;
}

export interface AuthSessionTable {
  id: string;
  expires_at: AuthDate;
  token: string;
  created_at: AuthDate;
  updated_at: AuthDate;
  ip_address: string | null;
  user_agent: string | null;
  user_id: string;
}

export interface AuthAccountTable {
  id: string;
  account_id: string;
  provider_id: string;
  user_id: string;
  access_token: string | null;
  refresh_token: string | null;
  id_token: string | null;
  access_token_expires_at: AuthDate | null;
  refresh_token_expires_at: AuthDate | null;
  scope: string | null;
  password: string | null;
  created_at: AuthDate;
  updated_at: AuthDate;
}

export interface AuthVerificationTable {
  id: string;
  identifier: string;
  value: string;
  expires_at: AuthDate;
  created_at: AuthDate;
  updated_at: AuthDate;
}

export interface AuthRateLimitTable {
  id: string;
  key: string;
  count: number;
  last_request: number;
}

export interface OwnerSetupClaimsTable {
  singleton_key: string;
  claim_id: string;
  claimed_at: string;
}

export interface BusinessesTable {
  id: string;
  owner_user_id: string;
  name: string;
  legal_name: string | null;
  email: string;
  phone: string | null;
  tax_id: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country_code: string | null;
  currency: string;
  timezone: string;
  invoice_prefix: string;
  next_invoice_number: number;
  default_payment_terms_days: number;
  payment_instructions: string | null;
  invoice_footer: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomersTable {
  id: string;
  business_id: string;
  name: string;
  billing_name: ColumnType<
    string | null,
    string | null | undefined,
    string | null
  >;
  avatar_data_url: ColumnType<
    string | null,
    string | null | undefined,
    string | null
  >;
  default_currency: ColumnType<
    string | null,
    string | null | undefined,
    string | null
  >;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  tax_id: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country_code: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ItemsTable {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  unit: string;
  unit_price_cents: number;
  tax_rate_bps: number;
  currency: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecurringInvoicesTable {
  id: string;
  business_id: string;
  customer_id: string;
  state: RecurringInvoiceState;
  frequency: RecurrenceFrequency;
  interval_count: number;
  start_date: string;
  end_date: string | null;
  next_issue_date: string;
  next_occurrence_index: number;
  payment_terms_days: number;
  currency: string;
  notes: string | null;
  payment_instructions: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecurringInvoiceLinesTable {
  id: string;
  business_id: string;
  recurring_invoice_id: string;
  item_id: string | null;
  position: number;
  description: string;
  details: ColumnType<string | null, string | null | undefined, string | null>;
  unit: string;
  quantity_thousandths: number;
  unit_price_cents: number;
  tax_rate_bps: number;
  created_at: string;
  updated_at: string;
}

export interface InvoicesTable {
  id: string;
  business_id: string;
  customer_id: string | null;
  recurring_invoice_id: string | null;
  recurrence_index: number | null;
  invoice_number: string | null;
  lifecycle: InvoiceLifecycle;
  issue_date: string | null;
  due_date: string | null;
  currency: string;
  base_currency: ColumnType<
    string | null,
    string | null | undefined,
    string | null
  >;
  exchange_rate_micros: ColumnType<
    number | null,
    number | null | undefined,
    number | null
  >;
  exchange_rate_date: ColumnType<
    string | null,
    string | null | undefined,
    string | null
  >;
  exchange_rate_source: ColumnType<
    string | null,
    string | null | undefined,
    string | null
  >;
  seller_name: string;
  seller_email: string | null;
  seller_phone: ColumnType<
    string | null,
    string | null | undefined,
    string | null
  >;
  seller_tax_id: string | null;
  seller_address: string | null;
  customer_name: string;
  customer_billing_name: ColumnType<
    string | null,
    string | null | undefined,
    string | null
  >;
  customer_email: string | null;
  customer_phone: ColumnType<
    string | null,
    string | null | undefined,
    string | null
  >;
  customer_tax_id: string | null;
  customer_address: string | null;
  notes: string | null;
  payment_instructions: string | null;
  invoice_footer: ColumnType<
    string | null,
    string | null | undefined,
    string | null
  >;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLinesTable {
  id: string;
  business_id: string;
  invoice_id: string;
  item_id: string | null;
  position: number;
  description: string;
  details: ColumnType<string | null, string | null | undefined, string | null>;
  unit: string;
  quantity_thousandths: number;
  unit_price_cents: number;
  tax_rate_bps: number;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  created_at: string;
  updated_at: string;
}

export interface PaymentsTable {
  id: string;
  business_id: string;
  invoice_id: string;
  payment_date: string;
  amount_cents: number;
  currency: string;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpensesTable {
  id: string;
  business_id: string;
  vendor: string;
  category: string;
  description: string | null;
  expense_date: string;
  currency: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  reference: string | null;
  notes: string | null;
  receipt_url: string | null;
  receipt_data_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecurringRunsTable {
  id: string;
  business_id: string;
  recurring_invoice_id: string;
  invoice_id: string | null;
  occurrence_index: number;
  scheduled_date: string;
  status: RecurringRunStatus;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Database {
  auth_user: AuthUserTable;
  auth_session: AuthSessionTable;
  auth_account: AuthAccountTable;
  auth_verification: AuthVerificationTable;
  auth_rate_limit: AuthRateLimitTable;
  owner_setup_claims: OwnerSetupClaimsTable;
  businesses: BusinessesTable;
  customers: CustomersTable;
  items: ItemsTable;
  invoices: InvoicesTable;
  invoice_lines: InvoiceLinesTable;
  payments: PaymentsTable;
  expenses: ExpensesTable;
  recurring_invoices: RecurringInvoicesTable;
  recurring_invoice_lines: RecurringInvoiceLinesTable;
  recurring_runs: RecurringRunsTable;
}

export type Business = Selectable<BusinessesTable>;
export type NewBusiness = Insertable<BusinessesTable>;
export type BusinessUpdate = Updateable<BusinessesTable>;
export type Customer = Omit<Selectable<CustomersTable>, "billing_name"> & {
  billing_name?: string | null;
};
export type NewCustomer = Insertable<CustomersTable>;
export type CustomerUpdate = Updateable<CustomersTable>;
export type Item = Selectable<ItemsTable>;
export type NewItem = Insertable<ItemsTable>;
export type ItemUpdate = Updateable<ItemsTable>;
export type Invoice = Selectable<InvoicesTable>;
export type NewInvoice = Insertable<InvoicesTable>;
export type InvoiceUpdate = Updateable<InvoicesTable>;
export type InvoiceLine = Selectable<InvoiceLinesTable>;
export type NewInvoiceLine = Insertable<InvoiceLinesTable>;
export type InvoiceLineUpdate = Updateable<InvoiceLinesTable>;
export type Payment = Selectable<PaymentsTable>;
export type NewPayment = Insertable<PaymentsTable>;
export type PaymentUpdate = Updateable<PaymentsTable>;
export type Expense = Selectable<ExpensesTable>;
export type NewExpense = Insertable<ExpensesTable>;
export type ExpenseUpdate = Updateable<ExpensesTable>;
export type RecurringInvoice = Selectable<RecurringInvoicesTable>;
export type NewRecurringInvoice = Insertable<RecurringInvoicesTable>;
export type RecurringInvoiceUpdate = Updateable<RecurringInvoicesTable>;
export type RecurringInvoiceLine = Selectable<RecurringInvoiceLinesTable>;
export type NewRecurringInvoiceLine = Insertable<RecurringInvoiceLinesTable>;
export type RecurringInvoiceLineUpdate = Updateable<RecurringInvoiceLinesTable>;
export type RecurringRun = Selectable<RecurringRunsTable>;
export type NewRecurringRun = Insertable<RecurringRunsTable>;
export type RecurringRunUpdate = Updateable<RecurringRunsTable>;
