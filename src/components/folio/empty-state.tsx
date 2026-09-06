import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type EmptyStateProps = Omit<
  ComponentProps<"div">,
  "children" | "title"
> & {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-64 flex-col items-center justify-center px-5 py-10 text-center",
        className,
      )}
      {...props}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className="mb-4 grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground [&_svg]:size-5"
        >
          {icon}
        </span>
      ) : null}
      <h2 className="text-balance text-[14px] font-medium leading-5 text-foreground">
        {title}
      </h2>
      {description ? (
        <p className="mt-1.5 max-w-sm text-pretty text-[13px] leading-5 text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? (
        <div className="mt-5 [&_[data-slot=button]]:rounded-2xl">
          {action}
        </div>
      ) : null}
    </div>
  );
}
