"use client"

import * as React from "react"
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons"
import { DayPicker, type DayPickerProps } from "react-day-picker"

import { cn } from "@/lib/utils"

function Calendar({ className, classNames, components, ...props }: DayPickerProps) {
  return (
    <DayPicker
      className={cn("w-fit p-3", className)}
      classNames={{
        button_next:
          "inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50",
        button_previous:
          "inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50",
        caption_label: "text-sm font-medium",
        chevron: "size-4",
        day: "size-8 p-0 text-center text-sm",
        day_button:
          "inline-flex size-8 items-center justify-center rounded-full p-0 font-normal text-inherit transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:relative focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50",
        disabled: "text-muted-foreground opacity-50",
        dropdown: "absolute inset-0 cursor-pointer opacity-0",
        dropdown_root: "relative inline-flex items-center",
        footer: "mt-2 text-sm text-muted-foreground",
        hidden: "invisible",
        month: "space-y-3",
        month_caption: "relative flex h-8 items-center justify-center",
        month_grid: "w-full border-collapse",
        months: "flex flex-col gap-4 sm:flex-row",
        nav: "absolute inset-x-3 top-3 z-10 flex items-center justify-between",
        outside: "text-muted-foreground opacity-50",
        range_end:
          "rounded-r-full bg-primary text-primary-foreground [&>button]:text-inherit",
        range_middle: "bg-accent text-accent-foreground",
        range_start:
          "rounded-l-full bg-primary text-primary-foreground [&>button]:text-inherit",
        root: "relative",
        selected:
          "rounded-full bg-primary text-primary-foreground [&>button]:text-inherit [&>button]:hover:bg-primary/90",
        today: "font-semibold text-primary",
        week: "mt-1 flex w-full",
        weekday: "w-8 rounded-full py-1 text-center text-[11px] font-medium text-muted-foreground",
        weekdays: "flex",
        ...classNames,
      }}
      components={{
        Chevron: ({ className: chevronClassName, disabled, orientation, size }) => {
          const Icon =
            orientation === "left"
              ? ChevronLeftIcon
              : orientation === "right"
                ? ChevronRightIcon
                : ChevronDownIcon

          return (
            <Icon
              aria-hidden="true"
              className={cn("size-4", chevronClassName)}
              data-disabled={disabled || undefined}
              size={size ?? 16}
            />
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

export { Calendar }
