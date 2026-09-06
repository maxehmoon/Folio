import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

import {
  BreadcrumbRegistration,
  type BreadcrumbItem,
} from "./breadcrumbs";

export type PageHeaderProps = Omit<
  ComponentProps<"header">,
  "children" | "title"
> & {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
};

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <>
      {breadcrumbs ? <BreadcrumbRegistration items={breadcrumbs} /> : null}
      <header
        className={cn(
          "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
          className,
        )}
        {...props}
      >
        <div className="min-w-0">
          <h1 className="text-balance text-[24px] font-medium leading-[30px] text-foreground">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-pretty text-[13px] leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 [&_[data-slot=button]]:rounded-2xl">
            {actions}
          </div>
        ) : null}
      </header>
    </>
  );
}
