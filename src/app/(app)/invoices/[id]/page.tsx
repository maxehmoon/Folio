import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText, Pencil, RefreshCw } from "@/components/ui/icons";

import { EntityHeader } from "@/components/folio/entity-header";
import { HorizontalSlidingTabBar } from "@/components/folio/sliding-tab-bar";
import { StatusBadge } from "@/components/folio/status-badge";
import { Button } from "@/components/ui/button";
import {
  deleteDraftInvoiceAction,
  issueInvoiceAction,
  updateDraftSellerAction,
} from "@/features/invoices/actions";
import { invoiceStatusLabel } from "@/features/invoices/calculations";
import { DeleteDraftDialog } from "@/features/invoices/delete-draft-dialog";
import { buildInvoiceDocumentData } from "@/features/invoices/document-mapper";
import { InvoiceDocument } from "@/features/invoices/invoice-document";
import { IssueInvoiceDialog } from "@/features/invoices/issue-invoice-dialog";
import { invoiceStatusTone } from "@/features/invoices/presentation";
import { getInvoiceDetail } from "@/features/invoices/queries";
import {
  deletePaymentAction,
  recordPaymentAction,
} from "@/features/payments/actions";
import { DeletePaymentDialog } from "@/features/payments/delete-payment-dialog";
import { PaymentDialog } from "@/features/payments/payment-dialog";
import {
  paymentMethodLabels,
  type PayableInvoice,
} from "@/features/payments/types";
import { formatDate, formatMoney, todayInTimeZone } from "@/lib/format";
import { convertCents } from "@/lib/finance/exchange";
import { requireBusiness } from "@/lib/session";

export const metadata: Metadata = { title: "Invoice" };

type InvoicePageProps = {
  params: Promise<{ id: string }>;
};

export default async function InvoicePage({ params }: InvoicePageProps) {
  const [business, { id }] = await Promise.all([requireBusiness(), params]);
  const today = todayInTimeZone(business.timezone);
  const detail = await getInvoiceDetail(business.id, id, today);
  if (!detail) notFound();

  const { invoice } = detail;
  const documentData = buildInvoiceDocumentData(detail);
  const payableInvoices: PayableInvoice[] =
    invoice.lifecycle === "issued" &&
    detail.balanceDueCents > 0 &&
    invoice.invoice_number
      ? [
          {
            id: invoice.id,
            invoiceNumber: invoice.invoice_number,
            customerName: invoice.customer_name,
            currency: invoice.currency,
            balanceDueCents: detail.balanceDueCents,
            status: detail.status,
          },
        ]
      : [];

  return (
    <div className="w-full space-y-6">
      <EntityHeader
        actions={
          invoice.lifecycle === "draft" ? (
            <>
              <Button asChild className="text-[13px]" variant="outline">
                <Link href={`/invoices/${invoice.id}/edit`}>
                  <Pencil aria-hidden="true" className="size-[14px]" />
                  Edit
                </Link>
              </Button>
              <form action={updateDraftSellerAction}>
                <input name="invoiceId" type="hidden" value={invoice.id} />
                <Button className="text-[13px]" type="submit" variant="outline">
                  <RefreshCw aria-hidden="true" className="size-[14px]" />
                  Update Bill from
                </Button>
              </form>
              <DeleteDraftDialog action={deleteDraftInvoiceAction} invoiceId={invoice.id} />
              <IssueInvoiceDialog action={issueInvoiceAction} invoiceId={invoice.id} />
            </>
          ) : (
            <>
              {payableInvoices.length ? (
                <PaymentDialog
                  action={recordPaymentAction}
                  initialInvoiceId={invoice.id}
                  invoices={payableInvoices}
                  key={`${invoice.id}-${detail.paidCents}`}
                  today={today}
                />
              ) : null}
              <Button asChild className="text-[13px]" variant="outline">
                <a href={`/api/invoices/${invoice.id}/pdf`}>
                  <Download aria-hidden="true" className="size-[14px]" />
                  Download PDF
                </a>
              </Button>
            </>
          )
        }
        backHref="/invoices"
        backLabel="invoices"
        breadcrumbs={[
          { label: "Invoices", href: "/invoices" },
          { label: invoice.invoice_number ?? "Draft invoice" },
        ]}
        identity={<FileText aria-hidden="true" className="size-5 text-muted-foreground" />}
        status={
          <StatusBadge
            label={invoiceStatusLabel(detail.status)}
            status={detail.status}
            tone={invoiceStatusTone(detail.status)}
          />
        }
        title={invoice.invoice_number ?? "Draft invoice"}
      />

      <HorizontalSlidingTabBar
        aria-label="Invoice sections"
        className="flex min-h-11 items-end gap-7 overflow-x-auto border-b"
      >
        <a
          className="relative z-10 -mb-px shrink-0 border-b-2 border-foreground px-0.5 pb-2.5 text-[13px] font-medium text-foreground motion-safe:transition-transform motion-safe:duration-150 motion-safe:active:scale-[0.98]"
          data-sliding-tab
          href="#preview"
        >
          Preview
        </a>
        <a
          className="relative z-10 shrink-0 border-b-2 border-transparent px-0.5 pb-2.5 text-[13px] font-medium text-subtle-foreground motion-safe:transition-[color,transform] motion-safe:duration-150 hover:text-muted-foreground motion-safe:active:scale-[0.98]"
          data-sliding-tab
          href="#payments"
        >
          Payments
        </a>
        <a
          className="relative z-10 shrink-0 border-b-2 border-transparent px-0.5 pb-2.5 text-[13px] font-medium text-subtle-foreground motion-safe:transition-[color,transform] motion-safe:duration-150 hover:text-muted-foreground motion-safe:active:scale-[0.98]"
          data-sliding-tab
          href="#details"
        >
          Invoice details
        </a>
      </HorizontalSlidingTabBar>

      <div className="grid gap-5 min-[1440px]:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0 scroll-mt-24 overflow-hidden rounded-[16px] bg-muted" id="preview">
          <div className="flex items-center justify-between gap-4 border-b bg-card px-4 py-3.5">
            <div>
              <h2 className="text-[14px] font-medium text-foreground">Invoice preview</h2>
              <p className="mt-0.5 text-[12px] text-subtle-foreground">The downloaded PDF uses this same document.</p>
            </div>
            {invoice.lifecycle === "issued" ? (
              <Button asChild className="rounded-full" size="icon-sm" variant="ghost">
                <a aria-label="Download invoice PDF" href={`/api/invoices/${invoice.id}/pdf`}>
                  <Download aria-hidden="true" className="size-[14px]" />
                </a>
              </Button>
            ) : null}
          </div>
          <div className="overflow-x-auto p-4 sm:p-6">
            <div className="mx-auto w-[700px] shadow-[0_10px_40px_rgb(41_41_41/0.08)]">
              <InvoiceDocument data={documentData} />
            </div>
          </div>
        </section>

        <aside className="space-y-4 xl:self-start">
          <section className="overflow-hidden rounded-[16px] bg-card">
            <div className="border-b p-4">
              <p className="text-[12px] text-subtle-foreground">Amount due</p>
              <p className="mt-2 text-[24px] font-medium leading-7 text-foreground">
                {formatMoney(detail.balanceDueCents, invoice.currency)}
              </p>
              <p className="mt-1 text-[12px] text-subtle-foreground">
                {invoice.due_date ? `Due ${formatDate(invoice.due_date)}` : "No due date"}
              </p>
            </div>
            <dl className="space-y-3 p-4 text-[13px]">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-subtle-foreground">Invoice total</dt>
                <dd className="font-medium text-foreground">{formatMoney(invoice.total_cents, invoice.currency)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-subtle-foreground">Paid</dt>
                <dd className="font-medium text-foreground">{formatMoney(detail.paidCents, invoice.currency)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-subtle-foreground">Tax</dt>
                <dd className="font-medium text-foreground">{formatMoney(invoice.tax_cents, invoice.currency)}</dd>
              </div>
            </dl>
          </section>

          <section className="scroll-mt-24 overflow-hidden rounded-[16px] bg-card" id="payments">
            <div className="flex items-center justify-between gap-3 border-b p-4">
              <div>
                <h2 className="text-[14px] font-medium text-foreground">Payments</h2>
                <p className="mt-0.5 text-[12px] text-subtle-foreground">{detail.payments.length} recorded</p>
              </div>
              {payableInvoices.length ? (
                <PaymentDialog
                  action={recordPaymentAction}
                  initialInvoiceId={invoice.id}
                  invoices={payableInvoices}
                  key={`rail-${invoice.id}-${detail.paidCents}`}
                  today={today}
                />
              ) : null}
            </div>
            {detail.payments.length ? (
              <div className="divide-y">
                {detail.payments.map((payment) => (
                  <div className="flex items-start justify-between gap-3 p-4" key={payment.id}>
                    <div>
                      <p className="text-[13px] font-medium text-foreground">{formatMoney(payment.amount_cents, payment.currency)}</p>
                      <p className="mt-1 text-[12px] text-subtle-foreground">{formatDate(payment.payment_date)} · {paymentMethodLabels[payment.method]}</p>
                      {payment.reference ? <p className="mt-1 text-[12px] text-subtle-foreground">{payment.reference}</p> : null}
                    </div>
                    <DeletePaymentDialog action={deletePaymentAction} paymentId={payment.id} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-[13px] leading-5 text-muted-foreground">
                {invoice.lifecycle === "draft"
                  ? "Issue this invoice before recording a payment."
                  : detail.balanceDueCents > 0
                    ? "Record a payment when you receive it."
                    : "This invoice has no balance due."}
              </div>
            )}
          </section>

          <section className="scroll-mt-24 overflow-hidden rounded-[16px] bg-card" id="details">
            <div className="border-b p-4">
              <h2 className="text-[14px] font-medium text-foreground">Invoice details</h2>
            </div>
            <dl className="space-y-3 p-4 text-[13px]">
              <div>
                <dt className="text-subtle-foreground">Customer</dt>
                <dd className="mt-1 text-foreground">
                  {invoice.customer_id ? (
                    <Link
                      className="underline-offset-4 hover:underline"
                      href={`/customers/${invoice.customer_id}`}
                    >
                      {invoice.customer_name}
                    </Link>
                  ) : (
                    invoice.customer_name
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-subtle-foreground">Issue date</dt>
                <dd className="mt-1 text-foreground">{invoice.issue_date ? formatDate(invoice.issue_date) : "Not issued"}</dd>
              </div>
              <div>
                <dt className="text-subtle-foreground">Currency</dt>
                <dd className="mt-1 text-foreground">{invoice.currency}</dd>
              </div>
              {invoice.currency !== business.currency &&
              invoice.exchange_rate_micros &&
              invoice.base_currency === business.currency ? (
                <div>
                  <dt className="text-subtle-foreground">Reporting value</dt>
                  <dd className="mt-1 text-foreground">
                    {formatMoney(
                      convertCents(
                        invoice.total_cents,
                        invoice.exchange_rate_micros,
                      ),
                      business.currency,
                    )}
                  </dd>
                  <dd className="mt-1 text-[12px] leading-5 text-subtle-foreground">
                    {invoice.exchange_rate_source} reference rate
                    {invoice.exchange_rate_date
                      ? ` · ${formatDate(invoice.exchange_rate_date)}`
                      : ""}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
