"use client"

import { useActionState, useId } from "react"
import Link from "next/link"
import { LoaderCircleIcon, SaveIcon } from "@/components/ui/icons"

import { FormField } from "@/components/folio/form-field"
import { useFocusFirstInvalid } from "@/components/folio/use-focus-first-invalid"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Textarea } from "@/components/ui/textarea"
import { INVOICE_CURRENCIES } from "@/lib/currencies"

import {
  type ItemFormField,
  type ItemFormState,
  type ItemFormValues,
} from "./schema"

const controlClassName =
  "h-10 rounded-[10px] border-foreground/[0.06] bg-field px-3 text-[14px] tracking-[-0.15px] placeholder:text-subtle-foreground"

type ItemFormAction = (
  state: ItemFormState,
  formData: FormData,
) => Promise<ItemFormState>

type ItemFormProps = {
  action: ItemFormAction
  cancelHref: string
  initialValues: ItemFormValues
  submitLabel: string
}

export function ItemForm({
  action,
  cancelHref,
  initialValues,
  submitLabel,
}: ItemFormProps) {
  const [state, formAction, isPending] = useActionState(action, {})
  const formId = useId()
  const formRef = useFocusFirstInvalid(state.fieldErrors)
  const values = state.values ?? initialValues
  const error = (field: ItemFormField) => state.fieldErrors?.[field]?.[0]
  const describedBy = (field: ItemFormField, hint = false) =>
    error(field)
      ? `${formId}-${field}-error`
      : hint
        ? `${formId}-${field}-hint`
        : undefined

  return (
    <form action={formAction} className="space-y-4" ref={formRef}>
      {state.message ? (
        <div
          role="alert"
          className="rounded-[10px] border border-destructive/30 bg-danger-background px-3 py-2.5 text-[13px] text-destructive"
        >
          {state.message}
        </div>
      ) : null}

      <Card className="gap-0 rounded-[16px] border border-foreground/[0.07] py-0 shadow-none ring-0">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <FormField
            error={error("name")}
            htmlFor={`${formId}-name`}
            label="Name"
            required
          >
            <Input
              id={`${formId}-name`}
              name="name"
              autoComplete="off"
              defaultValue={values.name}
              maxLength={120}
              required
              aria-describedby={describedBy("name")}
              aria-invalid={Boolean(error("name"))}
              className={controlClassName}
            />
          </FormField>

          <FormField
            error={error("description")}
            htmlFor={`${formId}-description`}
            label="Description"
            hint="Shown on invoices when this item is selected."
          >
            <Textarea
              id={`${formId}-description`}
              name="description"
              defaultValue={values.description}
              maxLength={1_000}
              aria-describedby={describedBy("description", true)}
              aria-invalid={Boolean(error("description"))}
              className="min-h-24 rounded-[10px] border-foreground/[0.06] bg-field px-3 py-2.5 text-[14px] leading-5 tracking-[-0.15px] placeholder:text-subtle-foreground"
            />
          </FormField>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              error={error("unit")}
              htmlFor={`${formId}-unit`}
              label="Unit"
              hint="For example, hour, day, or item."
              required
            >
              <Input
                id={`${formId}-unit`}
                name="unit"
                autoComplete="off"
                defaultValue={values.unit}
                maxLength={40}
                required
                aria-describedby={describedBy("unit", true)}
                aria-invalid={Boolean(error("unit"))}
                className={controlClassName}
              />
            </FormField>

            <FormField
              error={error("currency")}
              htmlFor={`${formId}-currency`}
              label="Currency"
              required
            >
              <SearchableSelect
                aria-describedby={describedBy("currency")}
                aria-invalid={Boolean(error("currency"))}
                className={controlClassName}
                defaultValue={values.currency}
                id={`${formId}-currency`}
                name="currency"
                options={INVOICE_CURRENCIES.map((currency) => ({
                  description: currency.name,
                  keywords: currency.name,
                  label: currency.code,
                  value: currency.code,
                }))}
                placeholder="Choose a currency…"
                required
                searchPlaceholder="Search currencies…"
              />
            </FormField>

            <FormField
              error={error("unitPrice")}
              htmlFor={`${formId}-unitPrice`}
              label="Unit price"
              hint="Enter an amount excluding tax."
              required
            >
              <Input
                id={`${formId}-unitPrice`}
                name="unitPrice"
                autoComplete="off"
                defaultValue={values.unitPrice}
                inputMode="decimal"
                pattern="[0-9]+([.][0-9]{1,2})?"
                placeholder="0.00…"
                required
                aria-describedby={describedBy("unitPrice", true)}
                aria-invalid={Boolean(error("unitPrice"))}
                className={controlClassName}
              />
            </FormField>

            <FormField
              error={error("taxRate")}
              htmlFor={`${formId}-taxRate`}
              label="Tax rate"
              hint="Percentage from 0 to 100."
              required
            >
              <div className="relative">
                <Input
                  id={`${formId}-taxRate`}
                  name="taxRate"
                  autoComplete="off"
                  defaultValue={values.taxRate}
                  inputMode="decimal"
                  pattern="[0-9]+([.][0-9]{1,2})?"
                  placeholder="0.00…"
                  required
                  aria-describedby={describedBy("taxRate", true)}
                  aria-invalid={Boolean(error("taxRate"))}
                  className={`${controlClassName} pr-9`}
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-subtle-foreground"
                >
                  %
                </span>
              </div>
            </FormField>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          asChild
          variant="ghost"
          className="h-9 rounded-full px-4 text-[13px] text-muted-foreground"
        >
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <Button
          type="submit"
          disabled={isPending}
          className="h-9 rounded-2xl bg-primary px-4 text-[13px] text-primary-foreground hover:bg-primary/80"
        >
          {isPending ? (
            <LoaderCircleIcon
              aria-hidden="true"
              className="size-3.5 animate-spin motion-reduce:animate-none"
            />
          ) : (
            <SaveIcon aria-hidden="true" className="size-3.5" />
          )}
          {isPending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  )
}
