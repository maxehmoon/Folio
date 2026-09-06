"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ChartPoint } from "@/features/reports/range";
import { formatMoney } from "@/lib/format";

const series = [
  {
    key: "salesCents",
    label: "Sales",
    className: "bg-chart-1",
  },
  {
    key: "receiptsCents",
    label: "Receipts",
    className: "bg-chart-2",
  },
  {
    key: "expensesCents",
    label: "Expenses",
    className: "bg-chart-3",
  },
] as const;

export function FinancialChart({
  currency,
  points,
}: {
  currency: string;
  points: ChartPoint[];
}) {
  const maximum = Math.max(
    1,
    ...points.flatMap((point) =>
      series.map((item) => Math.max(0, point[item.key])),
    ),
  );

  return (
    <figure aria-labelledby="financial-chart-title" className="min-w-0">
      <figcaption className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="financial-chart-title" className="text-[14px] font-medium text-foreground">
            Cash flow
          </h2>
          <p className="mt-1 text-[12px] text-muted-foreground">Last six months</p>
        </div>
        <ul aria-label="Chart legend" className="flex flex-wrap gap-4 text-[12px] text-muted-foreground">
          {series.map((item, index) => (
            <li
              key={item.key}
              className="folio-dashboard-detail flex items-center gap-1.5"
              style={{ animationDelay: `${100 + index * 24}ms` }}
            >
              <span aria-hidden="true" className={`size-2 rounded-[2px] ${item.className}`} />
              {item.label}
            </li>
          ))}
        </ul>
      </figcaption>

      <TooltipProvider delayDuration={80} skipDelayDuration={100}>
        <div className="grid h-56 grid-cols-6 items-end gap-2 border-b border-border sm:gap-4">
          {points.map((point, pointIndex) => {
            const accessibleValues = series
              .map((item) => `${item.label}: ${formatMoney(point[item.key], currency)}`)
              .join(", ");

            return (
              <Tooltip key={point.key}>
                <TooltipTrigger asChild>
                  <div
                    aria-label={`${point.label}. ${accessibleValues}`}
                    className="group flex h-full min-w-0 cursor-default flex-col justify-end gap-2 rounded-t-lg outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
                    tabIndex={0}
                  >
                    <div className="flex h-[188px] items-end justify-center gap-1" aria-hidden="true">
                      {series.map((item, seriesIndex) => {
                        const value = point[item.key];
                        const height = value > 0 ? Math.max(3, (value / maximum) * 100) : 1;
                        return (
                          <div
                            key={item.key}
                            className={`folio-dashboard-chart-bar w-full max-w-4 rounded-t-[3px] transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80 ${item.className}`}
                            style={{
                              animationDelay: `${105 + pointIndex * 18 + seriesIndex * 8}ms`,
                              height: `${height}%`,
                            }}
                          />
                        );
                      })}
                    </div>
                    <span
                      className="folio-dashboard-detail pb-2 text-center text-[12px] text-muted-foreground"
                      style={{ animationDelay: `${135 + pointIndex * 18}ms` }}
                    >
                      {point.label}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent
                  className="min-w-44 flex-col items-stretch gap-2 rounded-[12px] bg-inverse px-3 py-2.5 text-inverse-foreground shadow-lg"
                  side="top"
                  sideOffset={8}
                >
                  <p className="text-[12px] font-medium text-inverse-foreground">{point.label}</p>
                  <dl className="space-y-1.5">
                    {series.map((item) => (
                      <div className="flex items-center justify-between gap-5" key={item.key}>
                        <dt className="flex items-center gap-1.5 text-[12px] text-inverse-foreground/65">
                          <span
                            aria-hidden="true"
                            className={`size-2 rounded-[2px] ${item.className}`}
                          />
                          {item.label}
                        </dt>
                        <dd className="text-[12px] font-medium text-inverse-foreground">
                          {formatMoney(point[item.key], currency)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    </figure>
  );
}
