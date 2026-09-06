import type { Metadata } from "next";
import Link from "next/link";
import {
  Archive as ArchiveIcon,
  CalendarClock,
  FileClock,
  Pause,
  Pencil,
  Play,
  Plus,
} from "@/components/ui/icons";

import { EmptyState } from "@/components/folio/empty-state";
import { PageHeader } from "@/components/folio/page-header";
import { StatusBadge } from "@/components/folio/status-badge";
import { Button } from "@/components/ui/button";
import {
  archiveRecurringInvoiceAction,
  pauseRecurringInvoiceAction,
  resumeRecurringInvoiceAction,
} from "@/features/recurring/actions";
import { listRecurringInvoices } from "@/features/recurring/queries";
import type { RecurrenceFrequency } from "@/lib/db/types";
import { formatDate, formatMoney } from "@/lib/format";
import { requireBusiness } from "@/lib/session";

export const metadata: Metadata = { title: "Recurring invoices" };

function scheduleLabel(frequency: RecurrenceFrequency, interval: number): string {
  const unit = interval === 1 ? frequency : `${frequency}s`;
  return interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}`;
}

function dateBadge(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return {
    day: new Intl.DateTimeFormat("en-GB", { day: "2-digit", timeZone: "UTC" }).format(date),
    month: new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(date),
  };
}

export default async function RecurringInvoicesPage() {
  const business = await requireBusiness();
  const recurringInvoices = await listRecurringInvoices(business.id);
  const activeSchedules = recurringInvoices.filter((invoice) => invoice.state === "active");
  const inactiveSchedules = recurringInvoices.filter((invoice) => invoice.state !== "active");
  const nextRun = activeSchedules[0]?.next_issue_date;
  const nextRunValue = activeSchedules.reduce(
    (total, invoice) =>
      invoice.currency === business.currency ? total + invoice.totalCents : total,
    0,
  );

  return (
    <div className="w-full space-y-7">
      <PageHeader
        title="Recurring invoices"
        description="Create schedules that issue invoices automatically."
        actions={
          <Button asChild className="text-[13px]">
            <Link href="/recurring/new">
              <Plus aria-hidden="true" className="size-[14px]" />
              New schedule
            </Link>
          </Button>
        }
      />

      <section className="grid overflow-hidden rounded-[16px] bg-border sm:grid-cols-[1.2fr_1fr_1fr] sm:gap-px">
        <div className="bg-card p-5">
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <CalendarClock aria-hidden="true" className="size-5 text-subtle-foreground" />
            Automation status
          </div>
          <p className="mt-4 text-[24px] font-medium leading-7 text-foreground">
            {activeSchedules.length} active
          </p>
          <p className="mt-1 text-[12px] text-subtle-foreground">
            {inactiveSchedules.length} paused or ended
          </p>
        </div>
        <div className="border-t bg-card p-5 sm:border-t-0">
          <p className="text-[12px] text-subtle-foreground">Next issue date</p>
          <p className="mt-4 text-[24px] font-medium leading-7 text-foreground">
            {nextRun ? formatDate(nextRun) : "—"}
          </p>
          <p className="mt-1 text-[12px] text-subtle-foreground">Earliest active schedule</p>
        </div>
        <div className="border-t bg-card p-5 sm:border-t-0">
          <p className="text-[12px] text-subtle-foreground">Next-run value</p>
          <p className="mt-4 text-[24px] font-medium leading-7 text-foreground">
            {formatMoney(nextRunValue, business.currency)}
          </p>
          <p className="mt-1 text-[12px] text-subtle-foreground">Active schedules in {business.currency}</p>
        </div>
      </section>

      {recurringInvoices.length ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <section className="overflow-hidden rounded-[16px] bg-card">
            <div className="border-b px-4 py-3.5">
              <h2 className="text-[14px] font-medium text-foreground">Upcoming invoices</h2>
              <p className="mt-0.5 text-[12px] text-subtle-foreground">
                Active schedules ordered by their next issue date.
              </p>
            </div>
            {activeSchedules.length ? (
              <div className="divide-y">
                {activeSchedules.map((recurring) => {
                  const badge = dateBadge(recurring.next_issue_date);

                  return (
                    <article className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center" key={recurring.id}>
                      <div className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-muted text-center">
                        <span>
                          <span className="block text-[12px] font-medium uppercase text-subtle-foreground">{badge.month}</span>
                          <span className="block text-[14px] font-medium text-foreground">{badge.day}</span>
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link className="truncate text-[14px] font-medium text-foreground underline-offset-4 hover:underline" href={`/customers/${recurring.customerId}`}>
                            {recurring.customerName}
                          </Link>
                          <StatusBadge status={recurring.state} />
                        </div>
                        <p className="mt-1 text-[12px] text-subtle-foreground">
                          {scheduleLabel(recurring.frequency, recurring.interval_count)} · Started {formatDate(recurring.start_date)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 sm:justify-end">
                        <span className="text-[14px] font-medium text-foreground">
                          {formatMoney(recurring.totalCents, recurring.currency)}
                        </span>
                        <Button asChild aria-label={`Edit recurring invoice for ${recurring.customerName}`} className="rounded-full" size="icon-sm" variant="ghost">
                          <Link href={`/recurring/${recurring.id}/edit`}>
                            <Pencil aria-hidden="true" className="size-[14px]" />
                          </Link>
                        </Button>
                        <form action={pauseRecurringInvoiceAction.bind(null, recurring.id)}>
                          <Button aria-label={`Pause recurring invoice for ${recurring.customerName}`} className="rounded-full" size="icon-sm" title="Pause" type="submit" variant="ghost">
                            <Pause aria-hidden="true" className="size-[14px]" />
                          </Button>
                        </form>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-12 text-center">
                <p className="text-[14px] font-medium text-foreground">No active schedules</p>
                <p className="mt-1 text-[13px] text-muted-foreground">Resume a paused schedule or create a new one.</p>
              </div>
            )}
          </section>

          <aside className="overflow-hidden rounded-[16px] bg-card lg:self-start">
            <div className="border-b px-4 py-3.5">
              <h2 className="text-[14px] font-medium text-foreground">Paused and ended</h2>
            </div>
            {inactiveSchedules.length ? (
              <div className="divide-y">
                {inactiveSchedules.map((recurring) => (
                  <div className="p-4" key={recurring.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link className="block truncate text-[13px] font-medium text-foreground underline-offset-4 hover:underline" href={`/customers/${recurring.customerId}`}>
                          {recurring.customerName}
                        </Link>
                        <p className="mt-1 text-[12px] text-subtle-foreground">{scheduleLabel(recurring.frequency, recurring.interval_count)}</p>
                      </div>
                      <StatusBadge status={recurring.state} />
                    </div>
                    <div className="mt-3 flex items-center gap-1">
                      <Button asChild aria-label={`Edit recurring invoice for ${recurring.customerName}`} className="rounded-full" size="icon-sm" variant="ghost">
                        <Link href={`/recurring/${recurring.id}/edit`}>
                          <Pencil aria-hidden="true" className="size-[14px]" />
                        </Link>
                      </Button>
                      {recurring.state === "paused" ? (
                        <form action={resumeRecurringInvoiceAction.bind(null, recurring.id)}>
                          <Button className="rounded-full text-[12px]" size="xs" type="submit" variant="outline">
                            <Play aria-hidden="true" className="size-[14px]" />
                            Resume
                          </Button>
                        </form>
                      ) : null}
                      {recurring.state !== "ended" ? (
                        <form action={archiveRecurringInvoiceAction.bind(null, recurring.id)}>
                          <Button aria-label={`Archive recurring invoice for ${recurring.customerName}`} className="rounded-full text-subtle-foreground hover:text-destructive" size="icon-sm" title="Archive" type="submit" variant="ghost">
                            <ArchiveIcon aria-hidden="true" className="size-[14px]" />
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-4 py-8 text-center text-[13px] text-subtle-foreground">No paused or ended schedules.</p>
            )}
          </aside>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[16px] bg-card">
          <EmptyState
            action={
              <Button asChild>
                <Link href="/recurring/new">Create recurring invoice</Link>
              </Button>
            }
            description="Choose when Folio should issue the next invoice."
            icon={<FileClock aria-hidden="true" />}
            title="Create your first recurring invoice"
          />
        </div>
      )}
    </div>
  );
}
