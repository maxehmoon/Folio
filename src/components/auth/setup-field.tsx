import type { ComponentProps } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const controlClassName =
  "h-10 rounded-xl border-transparent bg-field px-3 text-[13px] tracking-[-0.1px] placeholder:text-subtle-foreground transition-[background-color,border-color,box-shadow] duration-100 hover:bg-input/70"

type SetupFieldProps = Omit<ComponentProps<typeof Input>, "id"> & {
  hint?: string
  id?: string
  label: string
}

export function SetupField({
  className,
  hint,
  id,
  label,
  name,
  required,
  ...props
}: SetupFieldProps) {
  const fieldId = id ?? name
  const hintId = hint ? `${fieldId}-hint` : undefined

  return (
    <div className="space-y-1.5" data-validation-container>
      <Label htmlFor={fieldId} className="text-[13px] text-foreground">
        {label}
        {required ? <span className="sr-only"> (required)</span> : null}
      </Label>
      <Input
        id={fieldId}
        name={name}
        required={required}
        aria-describedby={hintId}
        className={cn(controlClassName, className)}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-[12px] leading-4 text-subtle-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

type SetupTextareaFieldProps = Omit<ComponentProps<typeof Textarea>, "id"> & {
  hint?: string
  id?: string
  label: string
}

export function SetupTextareaField({
  className,
  hint,
  id,
  label,
  name,
  required,
  ...props
}: SetupTextareaFieldProps) {
  const fieldId = id ?? name
  const hintId = hint ? `${fieldId}-hint` : undefined

  return (
    <div className="space-y-1.5" data-validation-container>
      <Label htmlFor={fieldId} className="text-[13px] text-foreground">
        {label}
        {required ? <span className="sr-only"> (required)</span> : null}
      </Label>
      <Textarea
        id={fieldId}
        name={name}
        required={required}
        aria-describedby={hintId}
        className={cn(
          "min-h-24 rounded-xl border-transparent bg-field px-3 py-2.5 text-[13px] leading-5 tracking-[-0.1px] placeholder:text-subtle-foreground transition-[background-color,border-color,box-shadow] duration-100 hover:bg-input/70",
          className,
        )}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-[12px] leading-4 text-subtle-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

type SetupSelectFieldProps = Omit<
  ComponentProps<typeof SearchableSelect>,
  "id"
> & {
  hint?: string
  id: string
  label: string
}

export function SetupSelectField({
  className,
  hint,
  id,
  label,
  required,
  ...props
}: SetupSelectFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined

  return (
    <div className="space-y-1.5" data-validation-container>
      <Label htmlFor={id} className="text-[13px] text-foreground">
        {label}
        {required ? <span className="sr-only"> (required)</span> : null}
      </Label>
      <SearchableSelect
        aria-describedby={hintId}
        className={cn(
          "h-10 rounded-xl border-transparent bg-field px-3 text-[13px] text-foreground hover:bg-input/70",
          className,
        )}
        id={id}
        required={required}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-[11px] leading-4 text-subtle-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
