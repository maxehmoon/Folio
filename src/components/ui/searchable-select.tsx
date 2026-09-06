"use client"

import * as React from "react"
import { CheckIcon, ChevronDownIcon } from "@/components/ui/icons"

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type SearchableSelectOption = {
  description?: string
  icon?: React.ReactNode
  keywords?: string
  label: string
  value: string
}

type SearchableSelectProps = {
  "aria-describedby"?: string
  "aria-invalid"?: boolean | "false" | "true"
  className?: string
  defaultValue?: string
  disabled?: boolean
  emptyMessage?: string
  id?: string
  name?: string
  onValueChange?: (value: string) => void
  options: SearchableSelectOption[]
  placeholder?: string
  required?: boolean
  searchPlaceholder?: string
  value?: string
}

export const SEARCHABLE_SELECT_SET_VALUE_EVENT =
  "folio:set-searchable-select-value"

function SearchableSelect({
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  className,
  defaultValue = "",
  disabled,
  emptyMessage = "No matches found.",
  id,
  name,
  onValueChange,
  options,
  placeholder = "Choose an option…",
  required,
  searchPlaceholder = "Search…",
  value,
}: SearchableSelectProps) {
  const generatedListId = React.useId()
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const valueInputRef = React.useRef<HTMLInputElement>(null)
  const [open, setOpen] = React.useState(false)
  const [activeOption, setActiveOption] = React.useState("")
  const [internalValue, setInternalValue] = React.useState(defaultValue)
  const [requiredError, setRequiredError] = React.useState(false)
  const selectedValue = value ?? internalValue
  const selectedOption = options.find((option) => option.value === selectedValue)

  React.useEffect(() => {
    const input = valueInputRef.current
    if (!input || value !== undefined) return

    function restoreSubmittedValue(event: Event) {
      if (!(event instanceof CustomEvent) || typeof event.detail !== "string") {
        return
      }
      setInternalValue(event.detail)
    }

    input.addEventListener(
      SEARCHABLE_SELECT_SET_VALUE_EVENT,
      restoreSubmittedValue,
    )
    return () => {
      input.removeEventListener(
        SEARCHABLE_SELECT_SET_VALUE_EVENT,
        restoreSubmittedValue,
      )
    }
  }, [value])

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) {
      setActiveOption(selectedOption?.value ?? options[0]?.value ?? "")
    }
    setOpen(nextOpen)
  }

  function selectValue(nextValue: string) {
    if (value === undefined) setInternalValue(nextValue)
    setRequiredError(false)
    onValueChange?.(nextValue)
    setOpen(false)
  }

  return (
    <>
      {name ? (
        <input
          ref={valueInputRef}
          aria-hidden="true"
          autoComplete="off"
          className="pointer-events-none absolute size-px opacity-0"
          name={name}
          onChange={() => undefined}
          onInvalid={(event) => {
            event.preventDefault()
            setRequiredError(true)
            triggerRef.current?.focus()
          }}
          required={required}
          tabIndex={-1}
          type="text"
          value={selectedValue}
        />
      ) : null}
      <Popover onOpenChange={changeOpen} open={open}>
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            aria-controls={generatedListId}
            aria-describedby={ariaDescribedBy}
            aria-expanded={open}
            aria-invalid={ariaInvalid || requiredError || undefined}
            aria-required={required}
            className={cn(
              "group flex h-8 w-full items-center justify-between gap-2 rounded-2xl border border-transparent bg-input/50 px-3 text-left text-sm text-foreground outline-none transition-[background-color,border-color,box-shadow] duration-100 hover:bg-input/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
              !selectedOption && "text-muted-foreground",
              className,
            )}
            disabled={disabled}
            id={id}
            role="combobox"
            type="button"
          >
            <span className="min-w-0 flex-1 truncate">
              {selectedOption?.label ?? placeholder}
            </span>
            <ChevronDownIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground transition-transform duration-100 group-aria-expanded:rotate-180"
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) min-w-56 overflow-hidden"
        >
          <Command onValueChange={setActiveOption} value={activeOption}>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList className="max-h-64" id={generatedListId}>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  keywords={[
                    option.label,
                    option.description ?? "",
                    option.keywords ?? "",
                  ]}
                  onSelect={selectValue}
                  value={option.value}
                >
                  {option.icon ? (
                    <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted text-[11px] font-medium text-muted-foreground [&_svg]:size-4">
                      {option.icon}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate leading-4">
                      {option.label}
                    </span>
                    {option.description ? (
                      <span className="mt-0.5 block truncate text-[11px] leading-4 text-subtle-foreground">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                  <CheckIcon
                    aria-hidden="true"
                    className={cn(
                      "ml-auto size-4 shrink-0 text-foreground opacity-0 transition-opacity duration-100",
                      option.value === selectedValue && "opacity-100",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  )
}

export { SearchableSelect, type SearchableSelectOption }
