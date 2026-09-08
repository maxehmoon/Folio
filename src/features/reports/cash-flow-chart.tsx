"use client";

import { type PointerEvent, useEffect, useId, useRef, useState } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ChartPoint, ReportGranularity } from "@/features/reports/range";
import { formatDate, formatMoney } from "@/lib/format";

const series = [
  { key: "receiptsCents", label: "Payments received", className: "bg-success" },
  { key: "expensesCents", label: "Expenses", className: "bg-warning" },
] as const;

const granularityLabels = { day: "Daily", month: "Monthly", year: "Yearly", period: "Multi-year" };

export function ReportCashFlowChart({
  currency,
  points,
  granularity,
}: {
  currency: string;
  points: ChartPoint[];
  granularity: ReportGranularity;
}) {
  const titleId = useId();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; startX: number; scrollLeft: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [canScroll, setCanScroll] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const maximum = points.reduce(
    (highest, point) => Math.max(highest, point.receiptsCents, point.expensesCents),
    0,
  );
  const roughStep = Math.max(1, maximum / 4);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = ([1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10].find((value) => value * magnitude >= roughStep) ?? 10) * magnitude;
  const ceiling = step * 4;
  const axisFormatter = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    notation: "compact",
    minimumFractionDigits: 0,
    maximumFractionDigits: step < 100 ? 2 : 1,
  });

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    const observer = new ResizeObserver(() => {
      setCanScroll(scroller.scrollWidth > scroller.clientWidth + 1);
    });
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [points.length, granularity, maximum]);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    suppressClick.current = false;
    if (!canScroll || event.pointerType !== "mouse" || event.button !== 0) return;
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: event.currentTarget.scrollLeft,
      moved: false,
    };
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if ((event.buttons & 1) === 0) {
      endDrag(event);
      return;
    }
    const distance = event.clientX - current.startX;
    if (!current.moved && Math.abs(distance) <= 4) return;

    if (!current.moved) {
      current.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragging(true);
      setActiveKey(null);
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.scrollLeft = current.scrollLeft - distance;
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    suppressClick.current = drag.current.moved;
    drag.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <figure aria-labelledby={titleId} className="min-w-0">
      <figcaption className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={titleId} className="text-[14px] font-medium text-foreground">Cash flow</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">{granularityLabels[granularity]} totals</p>
        </div>
        <ul aria-label="Chart legend" className="flex flex-wrap gap-x-4 gap-y-2 text-[12px] text-muted-foreground">
          {series.map((item, index) => (
            <li key={item.key} className="folio-dashboard-detail flex items-center gap-1.5" style={{ animationDelay: `${100 + index * 24}ms` }}>
              <span aria-hidden="true" className={`size-2 rounded-[2px] ${item.className}`} />
              {item.label}
            </li>
          ))}
        </ul>
      </figcaption>

      {maximum === 0 ? (
        <div className="flex h-56 flex-col items-center justify-center px-6 text-center">
          <p className="text-[13px] font-medium text-foreground">No cash activity in this period</p>
          <p className="mt-1.5 max-w-72 text-[12px] leading-5 text-muted-foreground">
            No payments received or expenses recorded.
          </p>
        </div>
      ) : (
          <div className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] gap-2">
            <div aria-hidden="true" className="relative mt-2 h-[188px] text-right text-[10px] tabular-nums text-muted-foreground">
              {[4, 3, 2, 1, 0].map((tick, index) => (
                <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ top: `${index * 25}%` }}>
                  {axisFormatter.format((tick * step) / 100)}
                </span>
              ))}
            </div>
            <TooltipProvider delayDuration={80} skipDelayDuration={100}>
              <div
                ref={scrollRef}
                className={`min-w-0 overflow-x-auto pb-1 pt-2 select-none ${canScroll ? isDragging ? "cursor-grabbing" : "cursor-grab" : "cursor-default"}`}
                onPointerDown={startDrag}
                onPointerMoveCapture={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onLostPointerCapture={endDrag}
                onClickCapture={(event) => {
                  if (!suppressClick.current || event.detail === 0) return;
                  event.preventDefault();
                  event.stopPropagation();
                  suppressClick.current = false;
                }}
              >
                <div className="relative" style={{ minWidth: points.length * (granularity === "day" ? 42 : 64) }}>
                  <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[188px]">
                    {[0, 1, 2, 3, 4].map((tick) => (
                      <span
                        key={tick}
                        className={`absolute inset-x-0 border-t ${tick === 4 ? "border-border" : "border-dashed border-border/75"}`}
                        style={{ top: `${tick * 25}%` }}
                      />
                    ))}
                  </div>
                  <div className="relative grid" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
                    {points.map((point, pointIndex) => {
                      const period = granularity === "day"
                        ? formatDate(point.key)
                        : granularity === "month"
                          ? new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${point.key}-01T00:00:00Z`))
                          : point.label;
                      const netIncome = point.receiptsCents - point.expensesCents;
                      const accessibleValues = series.map((item) => `${item.label}: ${formatMoney(point[item.key], currency)}`).join(", ");

                      return (
                        <Tooltip
                          key={point.key}
                          open={activeKey === point.key}
                          onOpenChange={(open) => {
                            if (open && drag.current?.moved) return;
                            setActiveKey((current) => open ? point.key : current === point.key ? null : current);
                          }}
                        >
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label={`${period}. ${accessibleValues}. Cash net income: ${formatMoney(netIncome, currency)}.`}
                              className="group flex min-w-0 cursor-[inherit] flex-col gap-2 rounded-t-lg outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/30"
                              onClick={(event) => {
                                event.preventDefault();
                                setActiveKey(point.key);
                              }}
                            >
                              <span aria-hidden="true" className="flex h-[188px] w-full items-end justify-center gap-1 px-1.5">
                                {series.map((item, seriesIndex) => (
                                  <span
                                    key={item.key}
                                    className={`folio-dashboard-chart-bar w-full max-w-4 rounded-t-[3px] transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80 ${item.className}`}
                                    style={{
                                      animationDelay: `${105 + Math.min(pointIndex * 18, 220) + seriesIndex * 8}ms`,
                                      animationFillMode: "backwards",
                                      height: `${(Math.max(0, point[item.key]) / ceiling) * 100}%`,
                                    }}
                                  />
                                ))}
                              </span>
                              <span aria-hidden="true" className="folio-dashboard-detail w-full px-1 pb-2 text-center text-[12px] leading-4 text-muted-foreground" style={{ animationDelay: `${135 + Math.min(pointIndex * 18, 220)}ms` }}>
                                {point.label}
                              </span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" sideOffset={8} className="min-w-44 flex-col items-stretch gap-2 rounded-[12px] bg-inverse px-3 py-2.5 text-inverse-foreground shadow-lg">
                            <p className="text-[12px] font-medium">{period}</p>
                            <dl className="space-y-1.5">
                              {series.map((item) => (
                                <div key={item.key} className="flex items-center justify-between gap-5">
                                  <dt className="flex items-center gap-1.5 text-[12px] text-inverse-foreground/65">
                                    <span aria-hidden="true" className={`size-2 rounded-[2px] ${item.className}`} />
                                    {item.label}
                                  </dt>
                                  <dd className="text-[12px] font-medium tabular-nums">{formatMoney(point[item.key], currency)}</dd>
                                </div>
                              ))}
                              <div className="flex items-center justify-between gap-5 border-t border-inverse-foreground/15 pt-1.5">
                                <dt className="text-[12px] text-inverse-foreground/65">Cash net income</dt>
                                <dd className="text-[12px] font-medium tabular-nums">{formatMoney(netIncome, currency)}</dd>
                              </div>
                            </dl>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              </div>
            </TooltipProvider>
          </div>
      )}
    </figure>
  );
}
