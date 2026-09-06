import { useId } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "@/components/ui/icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildListHref,
  DEFAULT_LIST_PAGE_LIMIT,
  LIST_PAGE_LIMITS,
  type ListPageLimit,
  type ListQuery,
} from "@/lib/list-pagination";

type ListPaginationProps = {
  ariaLabel: string;
  emptyLabel: string;
  page: number;
  pageSize: ListPageLimit;
  pageSizeLabel: string;
  pathname: string;
  query?: ListQuery;
  rowCount: number;
  total: number;
  totalPages: number;
};

export function ListPagination({
  ariaLabel,
  emptyLabel,
  page,
  pageSize,
  pageSizeLabel,
  pathname,
  query = {},
  rowCount,
  total,
  totalPages,
}: ListPaginationProps) {
  const pageSizeId = useId();
  const first = rowCount > 0 ? (page - 1) * pageSize + 1 : 0;
  const last = first > 0 ? Math.min(first + rowCount - 1, total) : 0;
  const pageHref = (targetPage: number) =>
    buildListHref(pathname, {
      ...query,
      page: targetPage > 1 ? targetPage : undefined,
      limit: pageSize === DEFAULT_LIST_PAGE_LIMIT ? undefined : pageSize,
    });

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-[12px] text-subtle-foreground">
        <span>{rowCount > 0 ? `${first}–${last} of ${total}` : emptyLabel}</span>
        <form className="flex items-center gap-2" method="get">
          {Object.entries(query).map(([name, value]) =>
            value !== undefined && value !== null && value !== "" ? (
              <input key={name} name={name} type="hidden" value={String(value)} />
            ) : null,
          )}
          <label htmlFor={pageSizeId}>Per page</label>
          <Select defaultValue={String(pageSize)} name="limit">
            <SelectTrigger
              aria-label={pageSizeLabel}
              className="w-16 border border-foreground/10 bg-card text-[12px] text-muted-foreground"
              id={pageSizeId}
              size="sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIST_PAGE_LIMITS.map((limit) => (
                <SelectItem key={limit} value={String(limit)}>
                  {limit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            className="rounded-full text-[12px]"
            size="xs"
            type="submit"
            variant="ghost"
          >
            Update
          </Button>
        </form>
      </div>

      <nav aria-label={ariaLabel} className="flex items-center gap-1">
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
        <span className="min-w-20 text-center text-[12px] text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <Button
          aria-label="Next page"
          asChild={page < totalPages}
          className="rounded-full"
          disabled={page >= totalPages}
          size="icon-sm"
          variant="ghost"
        >
          {page < totalPages ? (
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
  );
}
