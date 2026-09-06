import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ExternalLink, Pencil, ReceiptText } from "@/components/ui/icons";
import { notFound } from "next/navigation";

import { EntityHeader } from "@/components/folio/entity-header";
import { HorizontalSlidingTabBar } from "@/components/folio/sliding-tab-bar";
import { StatusBadge } from "@/components/folio/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteExpense } from "@/features/expenses/actions";
import { getExpense } from "@/features/expenses/queries";
import { expenseReceipt } from "@/features/expenses/receipt";
import { expenseIdSchema } from "@/features/expenses/schema";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Expense details" };

type ExpensePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] leading-4 text-subtle-foreground">{label}</dt>
      <dd className="mt-1 text-[13px] leading-5 text-foreground">{value}</dd>
    </div>
  );
}

export default async function ExpensePage({ params, searchParams }: ExpensePageProps) {
  const [{ id: rawId }, rawSearchParams] = await Promise.all([params, searchParams]);
  const id = expenseIdSchema.safeParse(rawId);
  if (!id.success) notFound();

  const expense = await getExpense(id.data);
  if (!expense) notFound();
  const receipt = expenseReceipt(expense);

  const noticeValue = rawSearchParams.notice;
  const notice = (Array.isArray(noticeValue) ? noticeValue[0] : noticeValue) === "updated";
  const errorValue = rawSearchParams.error;
  const confirmDeleteError =
    (Array.isArray(errorValue) ? errorValue[0] : errorValue) === "confirm-delete";

  return (
    <div className="w-full space-y-6">
      <EntityHeader
        backHref="/expenses"
        backLabel="expenses"
        breadcrumbs={[
          { label: "Expenses", href: "/expenses" },
          { label: expense.vendor },
        ]}
        identity={<ReceiptText aria-hidden="true" className="size-5 text-muted-foreground" />}
        actions={
          <Button asChild className="text-[13px]" variant="secondary">
            <Link href={`/expenses/${expense.id}/edit`}>
              <Pencil aria-hidden="true" className="size-[14px]" />
              Edit expense
            </Link>
          </Button>
        }
        meta={`Recorded ${formatDate(expense.expense_date)}`}
        status={<StatusBadge status={expense.category} />}
        title={expense.vendor}
      />

      {notice ? (
        <p
          aria-live="polite"
          className="rounded-2xl border border-success/20 bg-success-background px-4 py-3 text-[13px] text-success"
          role="status"
        >
          Expense updated.
        </p>
      ) : null}

      <HorizontalSlidingTabBar
        aria-label="Expense sections"
        className="flex min-h-11 items-end gap-7 border-b"
      >
        <a
          className="relative z-10 -mb-px border-b-2 border-foreground px-0.5 pb-2.5 text-[13px] font-medium text-foreground motion-safe:transition-transform motion-safe:duration-150 motion-safe:active:scale-[0.98]"
          data-sliding-tab
          href="#details"
        >
          Details
        </a>
        <a
          className="relative z-10 border-b-2 border-transparent px-0.5 pb-2.5 text-[13px] font-medium text-subtle-foreground motion-safe:transition-[color,transform] motion-safe:duration-150 hover:text-muted-foreground motion-safe:active:scale-[0.98]"
          data-sliding-tab
          href="#amount"
        >
          Amount
        </a>
      </HorizontalSlidingTabBar>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="scroll-mt-24 rounded-2xl shadow-none ring-1 ring-border" id="details">
          <CardHeader className="border-b border-border">
            <CardTitle className="text-[14px] text-foreground">
              <h2>Expense details</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              <Detail label="Category" value={<StatusBadge status={expense.category} />} />
              <Detail label="Expense date" value={formatDate(expense.expense_date)} />
              {expense.reference ? <Detail label="Reference" value={expense.reference} /> : null}
              {expense.description ? (
                <div className="sm:col-span-2">
                  <Detail label="Description" value={expense.description} />
                </div>
              ) : null}
              {receipt?.kind === "image" ? (
                <div className="sm:col-span-2">
                  <Detail
                    label="Receipt"
                    value={
                      <div className="space-y-2">
                        <a
                          aria-label="Open receipt image"
                          className="relative block h-64 w-full max-w-sm overflow-hidden rounded-xl bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          href={receipt.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <Image
                            alt={`Receipt from ${expense.vendor}`}
                            className="object-contain"
                            fill
                            sizes="(max-width: 640px) 100vw, 384px"
                            src={receipt.url}
                            unoptimized
                          />
                        </a>
                        <a
                          className="inline-flex items-center gap-1.5 text-[12px] underline underline-offset-4 hover:text-muted-foreground"
                          href={receipt.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open full-size receipt
                          <ExternalLink aria-hidden="true" className="size-[14px]" />
                        </a>
                      </div>
                    }
                  />
                </div>
              ) : receipt?.kind === "legacy-link" ? (
                <div className="sm:col-span-2">
                  <Detail
                    label="Receipt"
                    value={
                      <a
                        className="inline-flex items-center gap-1.5 underline underline-offset-4 hover:text-muted-foreground"
                        href={receipt.url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Open receipt
                        <ExternalLink aria-hidden="true" className="size-[14px]" />
                      </a>
                    }
                  />
                </div>
              ) : null}
              {expense.notes ? (
                <div className="sm:col-span-2">
                  <Detail label="Internal notes" value={expense.notes} />
                </div>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="scroll-mt-24 rounded-2xl shadow-none ring-1 ring-border" id="amount">
            <CardHeader className="border-b border-border">
              <CardTitle className="text-[14px] text-foreground">
                <h2>Amount</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-[13px] text-muted-foreground">Subtotal</dt>
                  <dd className="text-[13px] text-foreground">
                    {formatMoney(expense.subtotal_cents, expense.currency)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-[13px] text-muted-foreground">Tax</dt>
                  <dd className="text-[13px] text-foreground">
                    {formatMoney(expense.tax_cents, expense.currency)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-t pt-3">
                  <dt className="text-[14px] font-medium text-foreground">Total</dt>
                  <dd className="text-[14px] font-medium text-foreground">
                    {formatMoney(expense.total_cents, expense.currency)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <details className="rounded-2xl border border-destructive/15 bg-destructive/5 px-4 py-3">
            <summary className="cursor-pointer text-[13px] font-medium text-destructive">
              Delete expense
            </summary>
            <p className="mt-2 text-[12px] leading-4 text-muted-foreground">
              This permanently removes the expense from reports. This action cannot be undone.
            </p>
            <form action={deleteExpense} className="mt-3">
              <input name="id" type="hidden" value={expense.id} />
              <label className="mb-3 flex items-start gap-2 text-[12px] leading-4 text-muted-foreground">
                <input
                  className="mt-0.5 size-3.5 accent-primary"
                  name="confirm"
                  required
                  type="checkbox"
                  value="yes"
                />
                I understand this expense will be permanently deleted.
              </label>
              {confirmDeleteError ? (
                <p className="mb-3 text-[12px] text-destructive" role="alert">
                  Confirm permanent deletion before continuing.
                </p>
              ) : null}
              <Button className="rounded-full text-[13px]" type="submit" variant="destructive">
                Permanently delete
              </Button>
            </form>
          </details>
        </div>
      </div>
    </div>
  );
}
