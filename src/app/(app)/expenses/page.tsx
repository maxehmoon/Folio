import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Plus,
  ReceiptText,
  Search,
} from "@/components/ui/icons";

import { DataTableShell } from "@/components/folio/data-table-shell";
import { EmptyState } from "@/components/folio/empty-state";
import { ListPagination } from "@/components/folio/list-pagination";
import { PageHeader } from "@/components/folio/page-header";
import { StatusBadge } from "@/components/folio/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";
import {
  buildListHref,
  DEFAULT_LIST_PAGE_LIMIT,
} from "@/lib/list-pagination";
import { listExpenses } from "@/features/expenses/queries";
import {
  parseExpenseListFilters,
  type ExpenseListFilters,
} from "@/features/expenses/schema";

export const metadata: Metadata = { title: "Expenses" };

type ExpensesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const NOTICE_MESSAGES: Record<string, string> = {
  created: "Expense created.",
  deleted: "Expense deleted.",
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function listHref(
  filters: ExpenseListFilters,
  changes: Partial<ExpenseListFilters>,
) {
  const next = { ...filters, ...changes };
  return buildListHref("/expenses", {
    q: next.q,
    category: next.category,
    page: next.page > 1 ? next.page : undefined,
    limit: next.limit === DEFAULT_LIST_PAGE_LIMIT ? undefined : next.limit,
  });
}

export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
  const rawSearchParams = await searchParams;
  const filters = parseExpenseListFilters(rawSearchParams);
  const result = await listExpenses(filters);
  const hasFilters = Boolean(filters.q || filters.category);
  const notice = NOTICE_MESSAGES[firstValue(rawSearchParams.notice) ?? ""];
  const receiptCoverage = result.summary.yearCount
    ? Math.round((result.summary.receiptCount / result.summary.yearCount) * 100)
    : 0;
  const largestCategory = result.summary.categoryBreakdown[0]?.totalCents ?? 0;

  if (filters.page > result.totalPages) {
    redirect(listHref(filters, { page: result.totalPages }));
  }

  return (
    <div className="w-full space-y-7">
      <PageHeader
        actions={
          <Button asChild className="text-[13px]">
            <Link href="/expenses/new">
              <Plus aria-hidden="true" className="size-[14px]" />
              New expense
            </Link>
          </Button>
        }
        description="Track business costs, tax and receipt images."
        title="Expenses"
      />

      {notice ? (
        <p
          aria-live="polite"
          className="rounded-2xl border border-success/20 bg-success-background px-4 py-3 text-[13px] text-success"
          role="status"
        >
          {notice}
        </p>
      ) : null}

      <section className="grid gap-px overflow-hidden rounded-[16px] bg-border lg:grid-cols-[1fr_1.4fr]">
        <div className="bg-card p-5">
          <p className="text-[13px] text-muted-foreground">Spent this month</p>
          <p className="mt-3 text-[24px] font-medium leading-7 text-foreground">
            {formatMoney(result.summary.monthCents, result.summary.currency)}
          </p>
          <dl className="mt-5 grid grid-cols-3 gap-4 border-t pt-4">
            <div>
              <dt className="text-[12px] text-subtle-foreground">This year</dt>
              <dd className="mt-1 truncate text-[13px] font-medium text-foreground">{formatMoney(result.summary.yearCents, result.summary.currency)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-subtle-foreground">Tax</dt>
              <dd className="mt-1 truncate text-[13px] font-medium text-foreground">{formatMoney(result.summary.taxCents, result.summary.currency)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-subtle-foreground">Receipts</dt>
              <dd className="mt-1 text-[13px] font-medium text-foreground">{receiptCoverage}%</dd>
            </div>
          </dl>
        </div>
        <div className="bg-card p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-[14px] font-medium text-foreground">Spend by category</h2>
              <p className="mt-0.5 text-[12px] text-subtle-foreground">Top categories this calendar year</p>
            </div>
            <span className="text-[12px] text-subtle-foreground">{result.summary.currency}</span>
          </div>
          {result.summary.categoryBreakdown.length ? (
            <div className="mt-4 space-y-3">
              {result.summary.categoryBreakdown.map((category) => (
                <div className="grid grid-cols-[minmax(5rem,0.8fr)_2fr_auto] items-center gap-3" key={category.category}>
                  <span className="truncate text-[12px] text-muted-foreground">{category.category}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-muted-foreground" style={{ width: `${largestCategory ? Math.max(6, (category.totalCents / largestCategory) * 100) : 0}%` }} />
                  </span>
                  <span className="text-right text-[12px] font-medium text-foreground">{formatMoney(category.totalCents, result.summary.currency)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-[13px] text-subtle-foreground">No expense activity this year.</p>
          )}
        </div>
      </section>

      <DataTableShell
        aria-label="Expenses list"
        footer={
          <ListPagination
            ariaLabel="Expense pages"
            emptyLabel="No expenses"
            page={filters.page}
            pageSize={filters.limit}
            pageSizeLabel="Expenses per page"
            pathname="/expenses"
            query={{ q: filters.q, category: filters.category }}
            rowCount={result.expenses.length}
            total={result.total}
            totalPages={result.totalPages}
          />
        }
      >
        <div className="border-b bg-surface-subtle px-4 py-3.5">
          <form className="flex flex-col gap-3 sm:flex-row" method="get">
            <div className="relative flex-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-[14px] -translate-y-1/2 text-subtle-foreground"
              />
              <Input
                aria-label="Search expenses"
                className="pl-8 text-[13px] md:text-[13px]"
                defaultValue={filters.q}
                name="q"
                placeholder="Search vendor, category or reference…"
                type="search"
              />
            </div>
            <label className="sr-only" htmlFor="expense-category-filter">
              Category
            </label>
            <SearchableSelect
              className="sm:w-48"
              defaultValue={filters.category}
              id="expense-category-filter"
              name="category"
              options={[
                { label: "All categories", value: "" },
                ...result.categories.map((category) => ({
                  label: category,
                  value: category,
                })),
              ]}
              placeholder="All categories"
              searchPlaceholder="Search categories…"
            />
            <input name="limit" type="hidden" value={filters.limit} />
            <Button className="rounded-full text-[13px]" type="submit" variant="outline">
              Apply
            </Button>
            {hasFilters ? (
              <Button asChild className="rounded-full text-[13px]" variant="ghost">
                <Link href="/expenses">Reset</Link>
              </Button>
            ) : null}
          </form>
        </div>

        {result.expenses.length ? (
          <Table className="min-w-[760px] text-[13px]">
            <TableHeader>
              <TableRow className="bg-surface-subtle hover:bg-surface-subtle">
                <TableHead className="h-10 px-4 text-[12px] text-subtle-foreground">Vendor</TableHead>
                <TableHead className="h-10 px-4 text-[12px] text-subtle-foreground">Category</TableHead>
                <TableHead className="h-10 px-4 text-[12px] text-subtle-foreground">Date</TableHead>
                <TableHead className="h-10 px-4 text-right text-[12px] text-subtle-foreground">
                  Tax
                </TableHead>
                <TableHead className="h-10 px-4 text-right text-[12px] text-subtle-foreground">
                  Total
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.expenses.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell className="px-4 py-3">
                    <Link
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                      href={`/expenses/${expense.id}`}
                    >
                      {expense.vendor}
                    </Link>
                    {expense.reference ? (
                      <p className="mt-0.5 text-[12px] text-subtle-foreground">
                        {expense.reference}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <StatusBadge status={expense.category} />
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">
                    {formatDate(expense.expense_date)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-muted-foreground">
                    {formatMoney(expense.tax_cents, expense.currency)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right font-medium text-foreground">
                    {formatMoney(expense.total_cents, expense.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            action={
              hasFilters ? (
                <Button asChild variant="secondary">
                  <Link href="/expenses">Clear filters</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/expenses/new">New expense</Link>
                </Button>
              )
            }
            description={
              hasFilters
                ? "Try another vendor, category or reference."
                : "Record a business purchase when it happens."
            }
            icon={<ReceiptText aria-hidden="true" />}
            title={hasFilters ? "No matching expenses" : "No expenses yet"}
          />
        )}
      </DataTableShell>
    </div>
  );
}
