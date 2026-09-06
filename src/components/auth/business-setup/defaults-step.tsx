import { FileTextIcon } from "@/components/ui/icons"

import {
  SetupField,
  SetupSelectField,
  SetupTextareaField,
} from "@/components/auth/setup-field"
import type { BusinessSetupDraft } from "@/components/auth/business-setup/draft"
import { INVOICE_CURRENCIES } from "@/lib/currencies"
import { formatTimezoneLabel, SUPPORTED_TIMEZONES } from "@/lib/timezones"
import { cn } from "@/lib/utils"

const currencyOptions = INVOICE_CURRENCIES.map((currency) => ({
  description: currency.name,
  keywords: currency.name,
  label: currency.code,
  value: currency.code,
}))

const timezoneOptions = SUPPORTED_TIMEZONES.map((timezone) => ({
  description: timezone,
  label: formatTimezoneLabel(timezone),
  value: timezone,
}))

type DefaultsStepProps = {
  active: boolean
  draft: BusinessSetupDraft
}

export function DefaultsStep({
  active,
  draft,
}: DefaultsStepProps) {
  return (
    <section
      className={cn(
        "space-y-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-1 motion-safe:duration-150",
        !active && "hidden",
      )}
      data-setup-step="2"
    >
      <header>
        <h2 className="text-[15px] font-medium text-foreground">
          Invoice defaults
        </h2>
        <p className="mt-1 text-[12px] leading-4 text-muted-foreground">
          Applied to new invoices. You can change them on each invoice.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <SetupSelectField
          defaultValue={draft.currency ?? ""}
          hint="Used for dashboard totals and reports."
          id="currency"
          label="Reporting currency"
          name="currency"
          options={currencyOptions}
          placeholder="Choose a currency…"
          required
          searchPlaceholder="Search currencies…"
        />
        <SetupField
          defaultValue={draft.paymentTermsDays ?? "30"}
          hint="Number of days until an invoice is due."
          inputMode="numeric"
          label="Payment terms"
          max={365}
          min={0}
          name="paymentTermsDays"
          required
          type="number"
        />
        <SetupField
          autoCapitalize="characters"
          defaultValue={draft.invoicePrefix ?? "INV"}
          hint="For example, INV-000001."
          label="Invoice prefix"
          maxLength={12}
          name="invoicePrefix"
          pattern="[A-Za-z0-9][A-Za-z0-9-]{0,11}"
          required
          spellCheck={false}
        />
        <SetupSelectField
          defaultValue={draft.timezone ?? "UTC"}
          hint="Used for dates and recurring schedules."
          id="timezone"
          label="Timezone"
          name="timezone"
          options={timezoneOptions}
          placeholder="Choose a timezone…"
          required
          searchPlaceholder="Search timezones…"
        />
      </div>

      <details className="group rounded-2xl bg-surface-subtle">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[12px] font-medium text-foreground marker:hidden">
          <FileTextIcon aria-hidden="true" className="size-3.5" />
          Add invoice payment copy
          <span className="ml-auto text-[11px] font-normal text-subtle-foreground">
            Optional
          </span>
        </summary>
        <div className="space-y-4 px-4 pb-4">
          <SetupTextareaField
            defaultValue={draft.paymentInstructions ?? ""}
            label="Payment instructions"
            maxLength={1000}
            name="paymentInstructions"
            placeholder="Bank details or payment instructions shown on invoices…"
          />
          <SetupTextareaField
            defaultValue={draft.invoiceFooter ?? ""}
            label="Invoice footer"
            maxLength={1000}
            name="invoiceFooter"
            placeholder="Contact details or another note shown at the bottom…"
          />
        </div>
      </details>
    </section>
  )
}
