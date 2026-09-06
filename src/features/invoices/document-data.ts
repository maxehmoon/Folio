/**
 * Plain-data contract shared by the on-screen and PDF invoice renderers.
 *
 * Monetary values are integer hundredths (for example, 2001 is $20.01). This
 * keeps the document boundary serialisable and avoids floating-point rounding
 * while leaving persistence choices to the caller.
 */
export interface InvoiceDocumentData {
  number: string;
  title?: string;
  currency: string;
  locale?: string;
  seller: InvoiceDocumentParty;
  customer: InvoiceDocumentParty;
  issuedAt: string;
  dueAt?: string;
  paidAt?: string;
  status: InvoiceDocumentStatus;
  lines: readonly InvoiceDocumentLine[];
  subtotal: number;
  tax: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  notes?: string;
  paymentDetails?: InvoiceDocumentPaymentDetails;
  contact?: InvoiceDocumentContact;
  footer?: InvoiceDocumentFooter;
  labels?: Partial<InvoiceDocumentLabels>;
}

export interface InvoiceDocumentParty {
  name: string;
  address: readonly string[];
  email?: string;
  phone?: string;
  taxId?: string;
  registrationNumber?: string;
}

export interface InvoiceDocumentLine {
  id: string;
  description: string;
  details?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  amount: number;
}

export interface InvoiceDocumentStatus {
  label: string;
  detail?: string;
  tone?: InvoiceDocumentStatusTone;
}

export type InvoiceDocumentStatusTone =
  | "neutral"
  | "paid"
  | "warning"
  | "danger";

export interface InvoiceDocumentPaymentDetails {
  heading?: string;
  lines: readonly string[];
}

export interface InvoiceDocumentContact {
  label?: string;
  email?: string;
  phone?: string;
  website?: string;
}

export interface InvoiceDocumentFooter {
  brand?: string;
  message?: string;
}

export interface InvoiceDocumentLabels {
  invoice: string;
  issued: string;
  due: string;
  paid: string;
  billFrom: string;
  billTo: string;
  status: string;
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  subtotal: string;
  tax: string;
  total: string;
  amountPaid: string;
  balanceDue: string;
  notes: string;
  paymentDetails: string;
}

export const defaultInvoiceDocumentLabels: Readonly<InvoiceDocumentLabels> = {
  invoice: "Invoice",
  issued: "Issued",
  due: "Due",
  paid: "Paid",
  billFrom: "Bill from",
  billTo: "Bill to",
  status: "Status",
  description: "Description",
  quantity: "Quantity",
  unitPrice: "Rate",
  amount: "Amount",
  subtotal: "Subtotal",
  tax: "Tax",
  total: "Total",
  amountPaid: "Amount paid",
  balanceDue: "Balance due",
  notes: "Notes",
  paymentDetails: "Payment details",
};

const DEFAULT_LOCALE = "en-GB";
const moneyFormatters = new Map<string, Intl.NumberFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const quantityFormatters = new Map<string, Intl.NumberFormat>();
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function getMoneyFormatter(currency: string, locale: string) {
  const key = `${locale}:${currency}`;
  const cached = moneyFormatters.get(key);

  if (cached) {
    return cached;
  }

  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  });

  moneyFormatters.set(key, formatter);
  return formatter;
}

/** Format the application's integer-hundredths money representation. */
export function formatMoney(
  amountInHundredths: number,
  currency: string,
  locale = DEFAULT_LOCALE,
) {
  const formatter = getMoneyFormatter(currency, locale);
  return formatter.format(amountInHundredths / 100);
}

/** Format an ISO date without allowing the host time zone to shift its day. */
export function formatDate(value: string, locale = DEFAULT_LOCALE) {
  const match = DATE_ONLY_PATTERN.exec(value);
  const date = match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    : new Date(value);
  const cached = dateFormatters.get(locale);
  const formatter =
    cached ??
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });

  if (!cached) {
    dateFormatters.set(locale, formatter);
  }

  return formatter.format(date);
}

export function formatQuantity(
  quantity: number,
  unit?: string,
  locale = DEFAULT_LOCALE,
) {
  const cached = quantityFormatters.get(locale);
  const formatter =
    cached ??
    new Intl.NumberFormat(locale, {
      maximumFractionDigits: 3,
    });

  if (!cached) {
    quantityFormatters.set(locale, formatter);
  }

  const formattedQuantity = formatter.format(quantity);
  return unit ? `${formattedQuantity} ${unit}` : formattedQuantity;
}

export function getInvoiceDocumentLabels(
  labels?: Partial<InvoiceDocumentLabels>,
): InvoiceDocumentLabels {
  return labels
    ? { ...defaultInvoiceDocumentLabels, ...labels }
    : { ...defaultInvoiceDocumentLabels };
}

export function getInvoiceDocumentTitle(data: InvoiceDocumentData) {
  return data.title ?? `${getInvoiceDocumentLabels(data.labels).invoice} from ${data.seller.name}`;
}

export function createInvoiceDocumentViewModel(data: InvoiceDocumentData) {
  const labels = getInvoiceDocumentLabels(data.labels);
  const uppercaseStatus = data.status.label.toUpperCase();
  const dates = [
    { key: "issued", label: labels.issued, value: data.issuedAt },
    ...(data.dueAt
      ? [{ key: "due", label: labels.due, value: data.dueAt }]
      : []),
    ...(data.paidAt
      ? [{ key: "paid", label: labels.paid, value: data.paidAt }]
      : []),
  ];
  const totals = [
    { key: "subtotal", label: labels.subtotal, amount: data.subtotal },
    ...(data.tax !== 0
      ? [{ key: "tax", label: labels.tax, amount: data.tax }]
      : []),
    { key: "total", label: labels.total, amount: data.total },
    ...(data.amountPaid !== 0
      ? [
          {
            key: "amount-paid",
            label: labels.amountPaid,
            amount: data.amountPaid,
          },
        ]
      : []),
    ...(data.amountPaid !== 0 || data.balanceDue !== 0
      ? [
          {
            key: "balance-due",
            label: labels.balanceDue,
            amount: data.balanceDue,
          },
        ]
      : []),
  ];

  return {
    dates,
    footerEmail: data.contact?.email ?? data.seller.email,
    footerMessage: data.footer?.message,
    headerStatus:
      uppercaseStatus === data.number.toUpperCase()
        ? undefined
        : uppercaseStatus,
    labels,
    title: getInvoiceDocumentTitle(data),
    totals,
  };
}
