import { ArrowDownToLine, ArrowUpRight, CalendarRange } from "@/components/ui/icons";
import Link from "next/link";

import { PageHeader } from "@/components/folio/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { CreditCardIcon } from "@/components/ui/credit-card";
import { File01Icon } from "@/components/ui/file-01";
import { Label } from "@/components/ui/label";
import { Wallet01Icon } from "@/components/ui/wallet-01";
import { ReportBreakdown } from "@/features/reports/report-breakdown";
import { ReportCashFlowChart } from "@/features/reports/cash-flow-chart";
import { ExpenseBreakdown } from "@/features/reports/expense-breakdown";
import { ReportHighlights } from "@/features/reports/report-highlights";
import {
  defaultReportRange,
  getReportInsights,
  parseDateRange,
} from "@/features/reports/queries";
import { formatDate, formatMoney, todayInTimeZone } from "@/lib/format";
import { requireBusiness } from "@/lib/session";

interface ReportsPageProps {
  searchParams: Promise<{ from?: string; to?: string }>;
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const [business, params] = await Promise.all([requireBusiness(), searchParams]);
  const range = parseDateRange(
    params.from,
    params.to,
    defaultReportRange(todayInTimeZone(business.timezone)),
  );
  const insights = await getReportInsights(
    business.id,
    range,
    business.currency,
  );
  const { summary } = insights;
  const exportHref = `/api/reports/export?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;

  return (
    <div className="space-y-7">
      <PageHeader
        className="folio-dashboard-enter"
        title="Reports"
        description="Sales, payments and expenses for the selected period."
        actions={
          <Button asChild variant="outline">
            <Link href={exportHref}>
              <ArrowDownToLine aria-hidden="true" data-icon="inline-start" />
              Export CSV
            </Link>
          </Button>
        }
      />

      <Card className="folio-dashboard-enter rounded-[16px] shadow-none">
        <CardContent className="grid items-center gap-6 px-5 py-0 sm:px-6 lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.2fr)]">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-muted text-muted-foreground">
              <CalendarRange aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-foreground">Reporting period</p>
              <p className="mt-1 max-w-xs text-[12px] leading-4 text-subtle-foreground">
                Choose the dates used for every figure below.
              </p>
            </div>
          </div>
          <form
            className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
            key={`${range.from}-${range.to}`}
            method="get"
          >
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="report-from">From</Label>
              <DatePicker defaultValue={range.from} id="report-from" name="from" />
            </div>
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="report-to">To</Label>
              <DatePicker defaultValue={range.to} id="report-to" name="to" />
            </div>
            <Button className="rounded-full sm:whitespace-nowrap" type="submit">
              Generate report
            </Button>
          </form>
        </CardContent>
      </Card>

      {summary.missingConversionCount > 0 ? (
        <p className="rounded-[16px] bg-warning-background px-4 py-3 text-[13px] text-warning">
          {summary.missingConversionCount}{" "}
          {summary.missingConversionCount === 1 ? "entry is" : "entries are"}
          {" "}excluded from the figures and charts because no conversion rate is stored.
        </p>
      ) : null}

      <section aria-label="Report totals" className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Invoice sales", value: summary.salesCents, count: insights.invoiceCount, singular: "issued invoice", plural: "issued invoices", icon: File01Icon, tone: "text-info", href: "/invoices" },
            { label: "Payments received", value: summary.receiptsCents, count: insights.receiptCount, singular: "payment", plural: "payments", icon: CreditCardIcon, tone: "text-success", href: "/payments" },
            { label: "Expenses", value: summary.expensesCents, count: insights.expenseCount, singular: "expense", plural: "expenses", icon: Wallet01Icon, tone: "text-warning", href: "/expenses" },
          ].map(({ label, value, count, singular, plural, icon: Icon, tone, href }, index) => (
            <Link
              className={`folio-dashboard-card folio-dashboard-enter folio-dashboard-delay-${index + 1} group min-w-0 rounded-[16px] bg-card p-4 shadow-[0_1px_2px_rgb(41_41_41/0.02)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
              data-haptic="selection"
              href={href}
              key={label}
              style={{ animationFillMode: "backwards" }}
            >
              <div className="flex items-start justify-between gap-4">
                <p className="text-[13px] text-muted-foreground">{label}</p>
                <Icon aria-hidden="true" className={`size-5 shrink-0 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out motion-safe:group-hover:-rotate-3 motion-safe:group-hover:scale-110 [&_svg]:size-full ${tone}`} size={20} />
              </div>
              <p className="mt-4 break-words text-[24px] font-medium tabular-nums leading-7">{formatMoney(value, business.currency)}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-[12px] text-subtle-foreground">
                <span>{count} {count === 1 ? singular : plural} in period</span>
                <span className="flex items-center gap-1 text-muted-foreground group-hover:text-foreground">
                  View all
                  <ArrowUpRight aria-hidden="true" className="size-3 motion-safe:transition-transform motion-safe:duration-150 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          ))}
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-label="Cash net income" className="folio-dashboard-enter folio-dashboard-delay-5 min-w-0 overflow-hidden rounded-[16px] bg-card shadow-[0_1px_2px_rgb(41_41_41/0.02)]">
          <div className="border-b p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] text-muted-foreground">Cash net income</p>
              <p className="text-[12px] text-subtle-foreground">{formatDate(range.from)} – {formatDate(range.to)} · {business.currency}</p>
            </div>
            <p className="mt-2 break-words text-[24px] font-medium tabular-nums leading-7">{formatMoney(summary.netIncomeCents, business.currency)}</p>
            <p className="mt-1 text-[12px] text-subtle-foreground">Payments received less expenses</p>
          </div>
          <div className="p-4 sm:p-5">
            <ReportCashFlowChart currency={business.currency} granularity={insights.granularity} points={insights.points} />
          </div>
          <ReportHighlights currency={business.currency} insights={insights} />
        </section>
        <ExpenseBreakdown categories={insights.expenseCategories} currency={business.currency} totalCents={summary.expensesCents} />
      </div>

      <Card className="folio-dashboard-enter rounded-[16px] shadow-none">
        <CardHeader>
          <CardTitle className="text-[14px]">Report breakdown</CardTitle>
          <p className="text-[12px] leading-5 text-muted-foreground">Invoice sales use issue dates. Cash income uses payment and expense dates.</p>
        </CardHeader>
        <CardContent>
          <ReportBreakdown currency={business.currency} summary={summary} />
        </CardContent>
      </Card>
    </div>
  );
}
