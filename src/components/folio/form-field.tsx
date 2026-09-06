import type { ReactNode } from "react"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

type FormFieldProps = {
  children: ReactNode
  className?: string
  error?: string
  hint?: string
  htmlFor: string
  label: string
  required?: boolean
}

export function FormField({
  children,
  className,
  error,
  hint,
  htmlFor,
  label,
  required,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)} data-validation-container>
      <Label htmlFor={htmlFor} className="text-[13px] text-foreground">
        {label}
        {required ? <span className="sr-only"> (required)</span> : null}
      </Label>
      {children}
      {error ? (
        <p
          id={`${htmlFor}-error`}
          className="text-[12px] leading-4 text-destructive"
        >
          {error}
        </p>
      ) : hint ? (
        <p
          id={`${htmlFor}-hint`}
          className="text-[12px] leading-4 text-subtle-foreground"
        >
          {hint}
        </p>
      ) : null}
    </div>
  )
}
