import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "@/components/ui/icons";

import { Button } from "@/components/ui/button";

import {
  BreadcrumbRegistration,
  type BreadcrumbItem,
} from "./breadcrumbs";

type EntityHeaderProps = {
  actions?: ReactNode;
  backHref: string;
  backLabel: string;
  breadcrumbs?: BreadcrumbItem[];
  identity: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  title: ReactNode;
};

export function EntityHeader({
  actions,
  backHref,
  backLabel,
  breadcrumbs,
  identity,
  meta,
  status,
  title,
}: EntityHeaderProps) {
  return (
    <>
      {breadcrumbs ? <BreadcrumbRegistration items={breadcrumbs} /> : null}
      <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            aria-label={`Back to ${backLabel}`}
            asChild
            className="shrink-0 rounded-full"
            size="icon-sm"
            variant="outline"
          >
            <Link href={backHref}>
              <ArrowLeft aria-hidden="true" className="size-[14px]" />
            </Link>
          </Button>
          <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full border bg-card text-[14px] font-medium text-foreground shadow-[0_1px_2px_rgb(41_41_41/0.03)]">
            {identity}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[24px] font-medium leading-[30px] tracking-[-0.15px] text-foreground">
              {title}
            </h1>
            {status || meta ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                {status}
                {status && meta ? <span aria-hidden="true">·</span> : null}
                {meta}
              </div>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 [&_[data-slot=button]]:rounded-full">
            {actions}
          </div>
        ) : null}
      </header>
    </>
  );
}
