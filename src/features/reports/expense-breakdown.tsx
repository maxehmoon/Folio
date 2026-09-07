"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, ReceiptText } from "@/components/ui/icons";
import { formatMoney } from "@/lib/format";

const categoryColours = [
  "text-info",
  "text-success",
  "text-warning",
  "text-chart-2",
  "text-chart-3",
];

export function ExpenseBreakdown({
  categories,
  currency,
  totalCents,
}: {
  categories: { category: string; totalCents: number }[];
  currency: string;
  totalCents: number;
}) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [focusedCategory, setFocusedCategory] = useState<string | null>(null);
  const visibleCategories = categories.filter((category) => category.totalCents > 0);
  const segments = visibleCategories.slice(0, 4);
  if (visibleCategories.length > 4) {
    segments.push({
      category: "Other categories",
      totalCents: visibleCategories.slice(4).reduce((total, category) => total + category.totalCents, 0),
    });
  }
  const shares = segments.map((segment) => (segment.totalCents / totalCents) * 100);
  const categoryKeys = segments.map((segment, index) => index === 4 ? "remainder" : `category:${segment.category}`);
  const activeCategory = hoveredCategory ?? focusedCategory ?? selectedCategory;
  const activeIndex = activeCategory === null ? -1 : categoryKeys.indexOf(activeCategory);
  const activeSegment = segments[activeIndex];

  return (
    <section aria-labelledby="expense-breakdown-title" className="folio-dashboard-enter folio-dashboard-delay-6 self-start overflow-hidden rounded-[16px] bg-card shadow-[0_1px_2px_rgb(41_41_41/0.02)]">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <h2 id="expense-breakdown-title" className="text-[14px] font-medium">Expenses by category</h2>
        <Button asChild className="shrink-0 rounded-full text-[12px]" size="sm" variant="ghost">
          <Link aria-label="View all expenses across all dates" href="/expenses" title="View all expenses across all dates">
            View all
            <ArrowUpRight aria-hidden="true" className="size-[13px] motion-safe:transition-transform motion-safe:duration-150 motion-safe:group-hover/button:-translate-y-0.5 motion-safe:group-hover/button:translate-x-0.5" />
          </Link>
        </Button>
      </div>

      {totalCents > 0 ? (
        <>
          <div className="relative mx-auto my-4 grid size-32 place-items-center">
            <svg aria-hidden="true" className="absolute inset-0 size-full -rotate-90" viewBox="0 0 100 100">
              <circle className="text-muted" cx="50" cy="50" fill="none" r="44" stroke="currentColor" strokeWidth="9" />
              {segments.map((segment, index) => (
                <circle
                  className={`${categoryColours[index]} transition-opacity duration-150 motion-reduce:transition-none`}
                  cx="50"
                  cy="50"
                  fill="none"
                  key={`${index}-${segment.category}`}
                  onPointerEnter={() => setHoveredCategory(categoryKeys[index])}
                  onPointerLeave={() => setHoveredCategory(null)}
                  opacity={activeSegment && activeIndex !== index ? 0.25 : 1}
                  pathLength="100"
                  r="44"
                  stroke="currentColor"
                  strokeDasharray={`${shares[index]} ${100 - shares[index]}`}
                  strokeDashoffset={-shares.slice(0, index).reduce((sum, share) => sum + share, 0)}
                  strokeWidth="9"
                />
              ))}
            </svg>
            <div className="pointer-events-none w-24 text-center">
              <p className="truncate text-[11px] text-muted-foreground" title={activeSegment?.category}>{activeSegment?.category ?? "Total spent"}</p>
              <p className="mt-1 truncate text-[15px] font-medium tabular-nums leading-5" title={formatMoney(activeSegment?.totalCents ?? totalCents, currency)}>{formatMoney(activeSegment?.totalCents ?? totalCents, currency)}</p>
              <p className="h-4 text-[10px] tabular-nums text-muted-foreground">{activeSegment ? `${shares[activeIndex].toFixed(1)}% of total` : ""}</p>
            </div>
          </div>
          <ul className="divide-y border-t">
            {segments.map((segment, index) => (
              <li key={`${index}-${segment.category}`}>
                <button
                  aria-pressed={selectedCategory === categoryKeys[index]}
                  className={`flex min-h-11 w-full items-center gap-2.5 px-5 py-2 text-left text-[12px] transition-colors duration-150 hover:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${activeIndex === index ? "bg-surface-subtle" : ""}`}
                  data-haptic="selection"
                  onBlur={() => setFocusedCategory(null)}
                  onClick={() => setSelectedCategory(selectedCategory === categoryKeys[index] ? null : categoryKeys[index])}
                  onFocus={() => {
                    setHoveredCategory(null);
                    setFocusedCategory(categoryKeys[index]);
                  }}
                  onPointerEnter={() => setHoveredCategory(categoryKeys[index])}
                  onPointerLeave={() => setHoveredCategory(null)}
                  title={`${segment.category}: ${formatMoney(segment.totalCents, currency)}, ${shares[index].toFixed(1)}% of total`}
                  type="button"
                >
                  <span aria-hidden="true" className={`size-2 shrink-0 rounded-full bg-current ${categoryColours[index]}`} />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{segment.category}</span>
                  <span className="shrink-0 font-medium tabular-nums">{formatMoney(segment.totalCents, currency)}</span>
                  <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">{shares[index].toFixed(1)}%</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="flex min-h-64 flex-col items-center justify-center px-5 py-4 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <ReceiptText aria-hidden="true" className="size-5" />
          </span>
          <p className="mt-4 text-[13px] font-medium">No expenses to break down</p>
          <p className="mt-1 max-w-56 text-[12px] leading-5 text-muted-foreground">Expenses in this period will appear here, grouped by category.</p>
        </div>
      )}
    </section>
  );
}
