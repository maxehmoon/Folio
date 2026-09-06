import { ArrowDownToLine, CalendarRange } from "@/components/ui/icons";
import Link from "next/link";

import { PageHeader } from "@/components/folio/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { ReportBreakdown } from "@/features/reports/report-breakdown";
import {
  defaultReportRange,
  getFinancialSummary,
  parseDateRange,
} from "@/features/reports/queries";
import { formatMoney, todayInTimeZone } from "@/lib/format";
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
  const summary = await getFinancialSummary(
    business.id,
    range,
    business.currency,
  );
  const exportHref = `/api/reports/export?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;

  return (
    <div className="space-y-7">
      <PageHeader
        title="Reports"
        description="Sales, receipts, expenses and cash net income for the selected period."
        actions={
          <Button asChild variant="outline">
            <Link href={exportHref}>
              <ArrowDownToLine aria-hidden="true" data-icon="inline-start" />
              Export CSV
            </Link>
          </Button>
        }
      />

      <Card className="rounded-[20px] shadow-none">
        <CardContent className="grid gap-6 px-5 py-0 sm:px-6 lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.2fr)] lg:items-end">
          <div className="flex items-start gap-3">
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

      <section aria-label="Report totals" className="grid gap-px overflow-hidden rounded-[16px] bg-border lg:grid-cols-[1.1fr_1fr]">
        <div className="bg-inverse p-5 text-inverse-foreground">
          <p className="text-[13px] text-inverse-foreground/60">Cash net income</p>
          <p className="mt-3 text-[24px] font-medium leading-7">{formatMoney(summary.netIncomeCents, business.currency)}</p>
          <p className="mt-1 text-[12px] text-inverse-foreground/55">Payments received less expenses</p>
          <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-inverse-foreground/10">
            <div className="bg-inverse p-3">
              <dt className="text-[12px] text-inverse-foreground/50">Receipts</dt>
              <dd className="mt-1 truncate text-[13px] font-medium">{formatMoney(summary.receiptsCents, business.currency)}</dd>
            </div>
            <div className="bg-inverse p-3">
              <dt className="text-[12px] text-inverse-foreground/50">Expenses</dt>
              <dd className="mt-1 truncate text-[13px] font-medium">{formatMoney(summary.expensesCents, business.currency)}</dd>
            </div>
          </dl>
        </div>
        <div className="bg-card p-5">
          <p className="text-[13px] text-muted-foreground">Invoice sales</p>
          <p className="mt-3 text-[24px] font-medium leading-7 text-foreground">{formatMoney(summary.salesCents, business.currency)}</p>
          <p className="mt-1 text-[12px] text-subtle-foreground">Issued invoices dated inside this period</p>
          <div className="mt-5 rounded-xl bg-surface-subtle p-3 text-[12px] leading-5 text-muted-foreground">
            Invoice sales use issue dates. Cash income uses payment and expense
            dates.
          </div>
        </div>
      </section>

      {summary.missingConversionCount > 0 ? (
        <p className="rounded-[16px] bg-warning-background px-4 py-3 text-[13px] text-warning">
          {summary.missingConversionCount}{" "}
          {summary.missingConversionCount === 1 ? "entry is" : "entries are"}
          {" "}excluded from these totals because no conversion rate is stored.
        </p>
      ) : null}

      <Card className="rounded-[16px] shadow-none">
        <CardHeader>
          <CardTitle className="text-[14px]">How this report is calculated</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportBreakdown currency={business.currency} summary={summary} />
        </CardContent>
      </Card>
    </div>
  );
}
