import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";

import { cn } from "@/lib/utils";

export type DataTableShellProps = Omit<ComponentProps<"section">, "title"> & {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
};

export function DataTableShell({
  title,
  description,
  actions,
  footer,
  children,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  ...props
}: DataTableShellProps) {
  const titleId = useId();
  const labelledBy = ariaLabelledBy ?? (title ? titleId : undefined);

  return (
    <section
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : labelledBy}
      className={cn(
        "overflow-hidden rounded-[16px] bg-card text-card-foreground shadow-[0_1px_2px_rgb(41_41_41/0.02)]",
        className,
        "border-0",
      )}
      {...props}
    >
      {title || description || actions ? (
        <div className="flex flex-col gap-3 border-b px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {title ? (
              <h2
                id={titleId}
                className="truncate text-[14px] font-medium leading-5 text-foreground"
              >
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-pretty text-[12px] leading-4 text-subtle-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2 [&_[data-slot=button]]:rounded-full">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="min-w-0">{children}</div>
      {footer ? (
        <div className="border-t px-4 py-3 text-[12px] text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
