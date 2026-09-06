import {
  SetupField,
  SetupSelectField,
} from "@/components/auth/setup-field"
import type { BusinessSetupDraft } from "@/components/auth/business-setup/draft"
import { COUNTRIES } from "@/lib/countries"
import { cn } from "@/lib/utils"

const countryOptions = COUNTRIES.map((country) => ({
  description: country.code,
  label: country.name,
  value: country.code,
}))

type AddressStepProps = {
  active: boolean
  draft: BusinessSetupDraft
}

export function AddressStep({ active, draft }: AddressStepProps) {
  return (
    <section
      className={cn(
        "space-y-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-1 motion-safe:duration-150",
        !active && "hidden",
      )}
      data-setup-step="1"
    >
      <header>
        <h2 className="text-[15px] font-medium text-foreground">
          Business address
        </h2>
        <p className="mt-1 text-[12px] leading-4 text-muted-foreground">
          Used as the seller address on invoices.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <SetupField
            autoComplete="address-line1"
            defaultValue={draft.addressLine1 ?? ""}
            label="Address"
            maxLength={160}
            name="addressLine1"
            placeholder="123 Market Street…"
            required
          />
        </div>
        <div className="sm:col-span-2">
          <SetupField
            autoComplete="address-line2"
            defaultValue={draft.addressLine2 ?? ""}
            label="Address line 2"
            maxLength={160}
            name="addressLine2"
            placeholder="Suite, floor, or unit (optional)"
          />
        </div>
        <SetupField
          autoComplete="address-level2"
          defaultValue={draft.city ?? ""}
          label="City"
          maxLength={100}
          name="city"
          required
        />
        <SetupField
          autoComplete="address-level1"
          defaultValue={draft.region ?? ""}
          label="Region / state"
          maxLength={100}
          name="region"
        />
        <SetupField
          autoComplete="postal-code"
          defaultValue={draft.postalCode ?? ""}
          label="Postcode"
          maxLength={24}
          name="postalCode"
          required
        />
        <SetupSelectField
          defaultValue={draft.countryCode ?? ""}
          id="countryCode"
          label="Country"
          name="countryCode"
          options={countryOptions}
          placeholder="Choose a country…"
          required
          searchPlaceholder="Search countries…"
        />
      </div>
    </section>
  )
}
