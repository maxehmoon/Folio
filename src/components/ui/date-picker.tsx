"use client"

import * as React from "react"
import { format, isValid, parseISO } from "date-fns"
import { CalendarDaysIcon } from "@/components/ui/icons"

import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type DatePickerProps = {
  "aria-describedby"?: string
  "aria-invalid"?: boolean | "false" | "true"
  "aria-label"?: string
  className?: string
  defaultValue?: string
  disabled?: boolean
  id?: string
  max?: string
  min?: string
  name?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  required?: boolean
  value?: string
}

function parseDate(value?: string) {
  if (!value) return undefined
  const date = parseISO(value)
  return isValid(date) ? date : undefined
}

function formatDateValue(date: Date | undefined) {
  return date ? format(date, "yyyy-MM-dd") : ""
}

function DatePicker({
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  className,
  defaultValue = "",
  disabled,
  id,
  max,
  min,
  name,
  onValueChange,
  placeholder = "Choose a date…",
  required,
  value,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [internalValue, setInternalValue] = React.useState(defaultValue)
  const selectedValue = value ?? internalValue
  const selectedDate = parseDate(selectedValue)
  const minDate = parseDate(min)
  const maxDate = parseDate(max)
  const disabledDates = [
    minDate ? { before: minDate } : null,
    maxDate ? { after: maxDate } : null,
  ].filter((matcher): matcher is { before: Date } | { after: Date } => matcher !== null)

  function selectDate(date: Date | undefined) {
    const nextValue = formatDateValue(date)
    if (value === undefined) setInternalValue(nextValue)
    onValueChange?.(nextValue)
    setOpen(false)
  }

  return (
    <>
      {name ? <input name={name} type="hidden" value={selectedValue} /> : null}
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <button
            aria-controls={id ? `${id}-calendar` : undefined}
            aria-describedby={ariaDescribedBy}
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-invalid={ariaInvalid}
            aria-label={ariaLabel}
            aria-required={required}
            className={cn(
              "flex h-8 w-full min-w-0 items-center gap-2 rounded-2xl border border-transparent bg-input/50 px-2.5 text-left text-sm text-foreground outline-none transition-[background-color,border-color,box-shadow] duration-200 hover:bg-input/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
              !selectedDate && "text-muted-foreground",
              className,
            )}
            disabled={disabled}
            id={id}
            role="combobox"
            type="button"
          >
            <CalendarDaysIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              {selectedDate ? format(selectedDate, "d MMM yyyy") : placeholder}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          aria-label={ariaLabel}
          className="data-[state=closed]:hidden"
          id={id ? `${id}-calendar` : undefined}
        >
          <Calendar
            autoFocus
            defaultMonth={selectedDate ?? new Date()}
            disabled={disabledDates.length ? disabledDates : undefined}
            mode="single"
            onSelect={selectDate}
            selected={selectedDate}
            showOutsideDays
            weekStartsOn={1}
          />
        </PopoverContent>
      </Popover>
    </>
  )
}

export { DatePicker, type DatePickerProps }
