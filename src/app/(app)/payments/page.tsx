import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Banknote, ChevronLeft, ChevronRight } from "@/components/ui/icons";

import { DataTableShell } from "@/components/folio/data-table-shell";
import { EmptyState } from "@/components/folio/empty-state";
import { PageHeader } from "@/components/folio/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deletePaymentAction,
  recordPaymentAction,
} from "@/features/payments/actions";
import { getInvoiceOverview } from "@/features/invoices/queries";
import { DeletePaymentDialog } from "@/features/payments/delete-payment-dialog";
import { PaymentDialog } from "@/features/payments/payment-dialog";
import {
  PAYMENT_PAGE_SIZE,
  listPayableInvoices,
  listPayments,
} from "@/features/payments/queries";
import { paymentMethodLabels } from "@/features/payments/types";
import { formatDate, formatMoney, todayInTimeZone } from "@/lib/format";
import { requireBusiness } from "@/lib/session";

export const metadata: Metadata = { title: "Payments" };

type PaymentsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 && page <= 10_000 ? page : 1;
}

function pageHref(page: number) {
  return page > 1 ? `/payments?page=${page}` : "/payments";
}

export default async function PaymentsPage({ searchParams }: PaymentsPageProps) {
  const [business, params] = await Promise.all([requireBusiness(), searchParams]);
  const page = parsePage(first(params.page));
  const today = todayInTimeZone(business.timezone);
  const [result, payableInvoices, overview] = await Promise.all([
    listPayments(business.id, page, business.currency, today),
    listPayableInvoices(business.id, today),
    getInvoiceOverview(business.id, business.currency, today),
  ]);
  const payments = result.payments;
  const paymentKey = `${result.total}-${payableInvoices.map((invoice) => `${invoice.id}:${invoice.balanceDueCents}`).join("|")}`;

  if (page > result.totalPages) {
    redirect(pageHref(result.totalPages));
  }

  const firstPayment = result.total ? (page - 1) * PAYMENT_PAGE_SIZE + 1 : 0;
  const lastPayment = firstPayment
    ? Math.min(firstPayment + payments.length - 1, result.total)
    : 0;

  return (
    <div className="w-full space-y-7">
      <PageHeader
        title="Payments"
        description="Record payments against issued invoices."
        actions={
          <PaymentDialog
            action={recordPaymentAction}
            defaultOpen={first(params.record) === "1" && payableInvoices.length > 0}
            invoices={payableInvoices}
            key={`${paymentKey}-${first(params.record) ?? "closed"}`}
            today={today}
          />
        }
      />

      <section className="grid gap-px overflow-hidden rounded-[16px] bg-border md:grid-cols-2">
        <div className="bg-card p-5">
          <p className="text-[13px] text-muted-foreground">Receipts in the last 30 days</p>
          <p className="mt-3 text-[24px] font-medium leading-7 text-foreground">
            {formatMoney(result.summary.recentCents, business.currency)}
          </p>
          <div className="mt-4 flex items-center justify-between gap-4 border-t pt-3 text-[12px]">
            <span className="text-subtle-foreground">All recorded receipts</span>
            <span className="font-medium text-foreground">{formatMoney(result.summary.totalCents, business.currency)}</span>
          </div>
          {result.summary.missingConversionCount > 0 ? (
            <p className="mt-2 text-[12px] text-muted-foreground">
              Excludes {result.summary.missingConversionCount}{" "}
              {result.summary.missingConversionCount === 1 ? "receipt" : "receipts"}
              {" "}without a usable exchange rate.
            </p>
          ) : null}
        </div>
        <div className="bg-inverse p-5 text-inverse-foreground">
          <p className="text-[13px] text-inverse-foreground/60">Still available to collect</p>
          <p className="mt-3 text-[24px] font-medium leading-7">
            {formatMoney(overview.amountDueCents, business.currency)}
          </p>
          <div className="mt-4 flex items-center justify-between gap-4 border-t border-white/10 pt-3 text-[12px]">
            <span className="text-inverse-foreground/55">Outstanding invoices</span>
            <span className="font-medium">{overview.issuedCount - overview.paidCount}</span>
          </div>
          {overview.unconvertedAmountDueCount > 0 ? (
            <p className="mt-2 text-[12px] text-inverse-foreground/55">
              Excludes {overview.unconvertedAmountDueCount}{" "}
              {overview.unconvertedAmountDueCount === 1 ? "invoice" : "invoices"}
              {" "}without a usable exchange rate.
            </p>
          ) : null}
        </div>
      </section>

      {payableInvoices.length === 0 && payments.length > 0 ? (
        <div className="rounded-[16px] border border-border bg-surface-subtle px-4 py-3 text-[13px] text-muted-foreground">
          Every issued invoice is currently settled.
        </div>
      ) : null}

      <DataTableShell
        description={`${result.total} ${result.total === 1 ? "receipt" : "receipts"} recorded against issued invoices`}
        footer={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              {result.total
                ? `${firstPayment}–${lastPayment} of ${result.total}`
                : "No receipts"}
            </span>
            <nav aria-label="Payment pages" className="flex items-center gap-1">
              <Button
                aria-label="Previous page"
                asChild={page > 1}
                className="rounded-full"
                disabled={page <= 1}
                size="icon-sm"
                variant="ghost"
              >
                {page > 1 ? (
                  <Link aria-label="Previous page" href={pageHref(page - 1)}>
                    <ChevronLeft aria-hidden="true" className="size-[14px]" />
                  </Link>
                ) : (
                  <span>
                    <ChevronLeft aria-hidden="true" className="size-[14px]" />
                  </span>
                )}
              </Button>
              <span className="min-w-20 text-center">
                Page {page} of {result.totalPages}
              </span>
              <Button
                aria-label="Next page"
                asChild={page < result.totalPages}
                className="rounded-full"
                disabled={page >= result.totalPages}
                size="icon-sm"
                variant="ghost"
              >
                {page < result.totalPages ? (
                  <Link aria-label="Next page" href={pageHref(page + 1)}>
                    <ChevronRight aria-hidden="true" className="size-[14px]" />
                  </Link>
                ) : (
                  <span>
                    <ChevronRight aria-hidden="true" className="size-[14px]" />
                  </span>
                )}
              </Button>
            </nav>
          </div>
        }
        title="Receipt ledger"
      >
        {payments.length > 0 ? (
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow className="bg-surface-subtle hover:bg-surface-subtle">
                <TableHead className="h-10 px-4 text-[12px] text-subtle-foreground">Date</TableHead>
                <TableHead className="h-10 px-4 text-[12px] text-subtle-foreground">Invoice</TableHead>
                <TableHead className="h-10 px-4 text-[12px] text-subtle-foreground">Customer</TableHead>
                <TableHead className="hidden h-10 px-4 text-[12px] text-subtle-foreground md:table-cell">Method</TableHead>
                <TableHead className="hidden h-10 px-4 text-[12px] text-subtle-foreground lg:table-cell">Reference</TableHead>
                <TableHead className="h-10 px-4 text-right text-[12px] text-subtle-foreground">Amount</TableHead>
                <TableHead className="h-10 w-12 px-4"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="px-4 py-3 text-[13px] text-foreground">
                    {formatDate(payment.payment_date)}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Link
                      className="text-[13px] font-medium text-foreground underline-offset-4 hover:underline"
                      href={`/invoices/${payment.invoice_id}`}
                    >
                      {payment.invoiceNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {payment.customerId ? (
                      <Link
                        className="text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        href={`/customers/${payment.customerId}`}
                      >
                        {payment.customerName}
                      </Link>
                    ) : (
                      <span className="text-[13px] text-muted-foreground">
                        {payment.customerName}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden px-4 py-3 text-[13px] text-muted-foreground md:table-cell">
                    {paymentMethodLabels[payment.method]}
                  </TableCell>
                  <TableCell className="hidden px-4 py-3 text-[12px] text-subtle-foreground lg:table-cell">
                    {payment.reference ?? "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-[13px] font-medium tabular-nums text-foreground">
                    {formatMoney(payment.amount_cents, payment.currency)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <DeletePaymentDialog action={deletePaymentAction} paymentId={payment.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            action={
              payableInvoices.length > 0 ? (
                <PaymentDialog
                  action={recordPaymentAction}
                  invoices={payableInvoices}
                  key={`empty-${paymentKey}`}
                  today={today}
                />
              ) : null
            }
            description={
              payableInvoices.length > 0
                ? "Record the first receipt against an outstanding invoice."
                : "Issue an invoice first; payments are recorded against its balance."
            }
            icon={<Banknote aria-hidden="true" />}
            title="No payments recorded"
          />
        )}
      </DataTableShell>
    </div>
  );
}
