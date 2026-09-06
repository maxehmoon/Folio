import {
  ArrowUpRight,
  ChevronDown,
  CircleDollarSign,
  FileClock,
  FileText,
  PackagePlus,
  ReceiptText,
  TriangleAlert,
  UserPlus,
} from "@/components/ui/icons";
import Link from "next/link";

import { Clock01Icon } from "@/components/ui/clock-01";
import { CreditCardIcon } from "@/components/ui/credit-card";
import { File01Icon } from "@/components/ui/file-01";
import { PlusSignIcon } from "@/components/ui/plus-sign";
import { UserMultiple02Icon } from "@/components/ui/user-multiple-02";
import { PageHeader } from "@/components/folio/page-header";
import { StatusBadge } from "@/components/folio/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { invoiceStatusLabel } from "@/features/invoices/calculations";
import { invoiceStatusTone } from "@/features/invoices/presentation";
import {
  getDashboardSummary,
  getDashboardUpdates,
  getFinancialSeries,
  type DashboardActivity,
} from "@/features/dashboard/queries";
import { FinancialChart } from "@/features/dashboard/financial-chart";
import { defaultReportRange } from "@/features/reports/range";
import { formatDate, formatMoney, todayInTimeZone } from "@/lib/format";
import { requireBusiness } from "@/lib/session";

const ACTIVITY_ICONS: Record<
  DashboardActivity["kind"],
  typeof FileText
> = {
  customer: UserPlus,
  expense: ReceiptText,
  invoice: FileText,
  payment: CircleDollarSign,
};

export default async function DashboardPage() {
  const business = await requireBusiness();
  const today = todayInTimeZone(business.timezone);
  const [summary, series, updates] = await Promise.all([
    getDashboardSummary(
      business.id,
      defaultReportRange(today),
      business.currency,
      today,
    ),
    getFinancialSeries(business.id, business.currency, today),
    getDashboardUpdates(business.id, today),
  ]);

  const currency = business.currency;
  return (
    <div className="folio-dashboard space-y-7">
      <PageHeader
        className="folio-dashboard-enter"
        title="Overview"
        description="Invoices billed, payments received, expenses and outstanding balances."
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <PlusSignIcon
                  aria-hidden="true"
                  className="size-[14px] [&_svg]:size-full"
                  size={14}
                />
                Quick Add
                <ChevronDown aria-hidden="true" className="size-[13px] opacity-65" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              collisionPadding={12}
              className="min-w-52 pl-2 sm:pl-1"
            >
              <DropdownMenuLabel className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-subtle-foreground">
                Create
              </DropdownMenuLabel>
              <DropdownMenuGroup>
                {[
                  {
                    href: "/invoices/new",
                    icon: FileText,
                    label: "Invoice",
                  },
                  {
                    href: "/recurring/new",
                    icon: FileClock,
                    label: "Recurring invoice",
                  },
                  {
                    href: "/customers/new",
                    icon: UserPlus,
                    label: "Customer",
                  },
                  {
                    href: "/items/new",
                    icon: PackagePlus,
                    label: "Item",
                  },
                  {
                    href: "/expenses/new",
                    icon: ReceiptText,
                    label: "Expense",
                  },
                ].map((item) => {
                  const Icon = item.icon;

                  return (
                    <DropdownMenuItem asChild key={item.href}>
                      <Link
                        className="min-h-9 text-[13px]"
                        href={item.href}
                      >
                        <Icon
                          aria-hidden="true"
                          className="size-4 text-muted-foreground"
                        />
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <section aria-label="Business overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Customers",
            value: summary.totalCustomers,
            href: "/customers",
            icon: UserMultiple02Icon,
          },
          {
            label: "Total invoices",
            value: summary.totalInvoices,
            href: "/invoices",
            icon: File01Icon,
          },
          {
            label: "Due invoices",
            value: summary.dueInvoices,
            href: "/invoices?status=outstanding",
            icon: CreditCardIcon,
          },
          {
            label: "Overdue",
            value: summary.overdueInvoices,
            href: "/invoices?status=overdue",
            icon: TriangleAlert,
          },
        ].map((metric, index) => {
          const Icon = metric.icon;
          return (
            <Link
              className={`folio-dashboard-card folio-dashboard-enter folio-dashboard-delay-${index + 1} group min-h-28 rounded-[16px] bg-card p-4 shadow-[0_1px_2px_rgb(41_41_41/0.02)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
              data-haptic="selection"
              href={metric.href}
              key={metric.label}
            >
              <div className="flex items-start justify-between gap-4">
                <p className="text-[13px] text-muted-foreground">{metric.label}</p>
                <Icon
                  aria-hidden="true"
                  className="size-5 text-subtle-foreground motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out motion-safe:group-hover:-rotate-3 motion-safe:group-hover:scale-110 [&_svg]:size-full"
                  size={20}
                />
              </div>
              <p className="mt-4 text-[24px] font-medium leading-7 tracking-[-0.15px] text-foreground">
                {metric.value.toLocaleString("en-GB")}
              </p>
            </Link>
          );
        })}
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="folio-dashboard-enter folio-dashboard-delay-5 self-start overflow-hidden rounded-[16px] bg-card shadow-[0_1px_2px_rgb(41_41_41/0.02)]">
          <div className="border-b p-5">
            <p className="text-[13px] text-muted-foreground">Cash net income this year</p>
            <p className="mt-2 text-[24px] font-medium leading-7 tracking-[-0.15px] text-foreground">
              {formatMoney(summary.netIncomeCents, currency)}
            </p>
            <dl className="mt-5 grid grid-cols-3 gap-5">
              {[
                ["Sales", summary.salesCents],
                ["Receipts", summary.receiptsCents],
                ["Expenses", summary.expensesCents],
              ].map(([label, value], index) => (
                <div
                  className="folio-dashboard-detail border-l pl-3"
                  key={label}
                  style={{ animationDelay: `${150 + index * 28}ms` }}
                >
                  <dt className="text-[12px] text-subtle-foreground">{label}</dt>
                  <dd className="mt-1 truncate text-[13px] font-medium text-foreground">
                    {formatMoney(Number(value), currency)}
                  </dd>
                </div>
              ))}
            </dl>
            {summary.missingConversionCount > 0 ||
            series.missingConversionCount > 0 ? (
              <p className="mt-4 rounded-xl bg-warning-background px-3 py-2 text-[12px] text-warning">
                Some foreign-currency entries are excluded because no conversion
                rate is stored.
              </p>
            ) : null}
          </div>
          <div className="p-4 sm:p-5">
            <FinancialChart currency={currency} points={series.points} />
          </div>
        </section>

        <aside className="folio-dashboard-enter folio-dashboard-delay-6 grid gap-4 xl:grid-rows-[auto_1fr]">
          <section className="folio-dashboard-collections overflow-hidden rounded-[16px] bg-inverse p-4 text-inverse-foreground">
            <div className="flex items-center justify-between gap-4">
              <p className="text-[13px] text-inverse-foreground/60">Collections</p>
              <Clock01Icon
                aria-hidden="true"
                className="size-5 text-inverse-foreground/45 [&_svg]:size-full"
                size={20}
              />
            </div>
            <p className="mt-3 text-[24px] font-medium leading-7">
              {formatMoney(summary.amountDueCents, currency)}
            </p>
            <p className="mt-1 text-[12px] text-inverse-foreground/55">Still to collect</p>
            {summary.missingAmountDueCount > 0 ? (
              <p className="mt-2 text-[11px] text-warning">
                Excludes {summary.missingAmountDueCount} foreign-currency
                {summary.missingAmountDueCount === 1 ? " invoice" : " invoices"}
                without a stored rate.
              </p>
            ) : null}
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
              <p className="text-[12px] text-inverse-foreground/55">
                <span className="font-medium tabular-nums text-inverse-foreground">
                  {summary.dueInvoices}
                </span>{" "}
                due
                <span aria-hidden="true" className="mx-1.5 text-inverse-foreground/25">
                  ·
                </span>
                <span className="font-medium tabular-nums text-inverse-foreground">
                  {summary.overdueInvoices}
                </span>{" "}
                overdue
              </p>
              <Button
                asChild
                className="group h-7 shrink-0 rounded-full px-2.5 text-[12px] text-inverse-foreground/75 hover:bg-inverse-foreground/10 hover:text-inverse-foreground"
                size="xs"
                variant="ghost"
              >
                <Link href="/invoices?status=outstanding">
                  Review
                  <ArrowUpRight
                    aria-hidden="true"
                    className="size-[13px] motion-safe:transition-transform motion-safe:duration-150 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5"
                  />
                </Link>
              </Button>
            </div>
          </section>

          <section
            aria-labelledby="recent-activity-heading"
            className="min-h-0 overflow-hidden rounded-[16px] bg-card shadow-[0_1px_2px_rgb(41_41_41/0.02)]"
          >
            <div className="border-b px-4 py-2.5">
              <h2
                className="text-[13px] font-medium text-foreground"
                id="recent-activity-heading"
              >
                Recent activity
              </h2>
            </div>
            {updates.activity.length > 0 ? (
              <div className="divide-y">
                {updates.activity.map((activity, index) => {
                  const Icon = ACTIVITY_ICONS[activity.kind];

                  return (
                    <Link
                      className="folio-dashboard-detail group flex min-h-10 items-center gap-2.5 px-3 py-1.5 transition-colors duration-150 hover:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                      data-haptic="selection"
                      href={activity.href}
                      key={activity.id}
                      style={{ animationDelay: `${230 + index * 24}ms` }}
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-muted text-muted-foreground">
                        <Icon aria-hidden="true" className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-foreground">
                          {activity.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] text-subtle-foreground">
                          {activity.detail}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        {activity.money ? (
                          <span className="block text-[12px] font-medium tabular-nums text-muted-foreground">
                            {formatMoney(
                              activity.money.amountCents,
                              activity.money.currency,
                            )}
                          </span>
                        ) : null}
                        <span className="mt-0.5 block text-[11px] tabular-nums text-subtle-foreground">
                          {formatDate(activity.happenedAt)}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="grid min-h-48 place-items-center px-5 py-8 text-center">
                <div>
                  <FileClock
                    aria-hidden="true"
                    className="mx-auto size-5 text-subtle-foreground"
                  />
                  <p className="mt-2 text-[13px] font-medium text-foreground">
                    No activity yet
                  </p>
                  <p className="mt-1 text-[12px] text-subtle-foreground">
                    New invoices, payments and customers will appear here.
                  </p>
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>

      <section
        aria-labelledby="recent-invoices-heading"
        className="folio-dashboard-enter overflow-hidden rounded-[16px] bg-card shadow-[0_1px_2px_rgb(41_41_41/0.02)]"
      >
        <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
          <div>
            <h2
              className="text-[14px] font-medium text-foreground"
              id="recent-invoices-heading"
            >
              Recent invoices
            </h2>
          </div>
          <Button asChild className="shrink-0 rounded-full text-[12px]" size="sm" variant="ghost">
            <Link href="/invoices">
              View all
              <ArrowUpRight aria-hidden="true" className="size-[13px]" />
            </Link>
          </Button>
        </div>

        {updates.invoices.length > 0 ? (
          <div className="divide-y">
            {updates.invoices.map((invoice, index) => (
              <div
                className="folio-dashboard-detail grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-3 transition-colors duration-150 hover:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:grid-cols-[minmax(0,1.5fr)_auto_auto] md:grid-cols-[minmax(0,1.5fr)_auto_auto_auto]"
                data-haptic="selection"
                key={invoice.id}
                style={{ animationDelay: `${280 + index * 24}ms` }}
              >
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <Link
                      className="truncate text-[13px] font-medium text-foreground underline-offset-4 hover:underline"
                      href={`/invoices/${invoice.id}`}
                    >
                      {invoice.invoiceNumber ?? "Draft invoice"}
                    </Link>
                    <StatusBadge
                      className="sm:hidden"
                      label={invoiceStatusLabel(invoice.status)}
                      status={invoice.status}
                      tone={invoiceStatusTone(invoice.status)}
                    />
                  </span>
                  {invoice.customerId ? (
                    <Link
                      className="mt-0.5 block truncate text-[12px] text-subtle-foreground underline-offset-4 hover:text-foreground hover:underline"
                      href={`/customers/${invoice.customerId}`}
                    >
                      {invoice.customerName}
                    </Link>
                  ) : (
                    <span className="mt-0.5 block truncate text-[12px] text-subtle-foreground">
                      {invoice.customerName}
                    </span>
                  )}
                </span>
                <StatusBadge
                  className="hidden sm:inline-flex"
                  label={invoiceStatusLabel(invoice.status)}
                  status={invoice.status}
                  tone={invoiceStatusTone(invoice.status)}
                />
                <span className="hidden text-[12px] tabular-nums text-subtle-foreground md:block">
                  {formatDate(invoice.issueDate ?? invoice.createdAt)}
                </span>
                <span className="text-right text-[13px] font-medium tabular-nums text-foreground">
                  {formatMoney(invoice.totalCents, invoice.currency)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-10 text-center">
            <p className="text-[13px] font-medium text-foreground">
              No invoices yet
            </p>
            <p className="mt-1 text-[12px] text-subtle-foreground">
              New invoices appear here.
            </p>
            <Button asChild className="mt-4 text-[13px]">
              <Link href="/invoices/new">Create invoice</Link>
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
