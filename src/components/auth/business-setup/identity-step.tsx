import { BusinessIconField } from "@/components/auth/business-icon-field"
import type { BusinessSetupDraft } from "@/components/auth/business-setup/draft"
import { SetupField } from "@/components/auth/setup-field"
import { cn } from "@/lib/utils"

type IdentityStepProps = {
  active: boolean
  draft: BusinessSetupDraft
  ownerEmail: string
}

export function IdentityStep({ active, draft, ownerEmail }: IdentityStepProps) {
  return (
    <section
      className={cn(
        "space-y-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-1 motion-safe:duration-150",
        !active && "hidden",
      )}
      data-setup-step="0"
    >
      <header>
        <h2 className="text-[15px] font-medium text-foreground">
          Your organisation
        </h2>
        <p className="mt-1 text-[12px] leading-4 text-muted-foreground">
          These details are copied to new invoices.
        </p>
      </header>

      <BusinessIconField />

      <div className="grid gap-4 sm:grid-cols-2">
        <SetupField
          autoComplete="organization"
          defaultValue={draft.name ?? ""}
          label="Trading name"
          maxLength={120}
          name="name"
          placeholder="Acme Studio…"
          required
        />
        <SetupField
          autoComplete="organization"
          defaultValue={draft.legalName ?? ""}
          hint="Optional, if different from your trading name."
          label="Legal name"
          maxLength={160}
          name="legalName"
          placeholder="Acme Studio Ltd…"
        />
        <SetupField
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect="off"
          defaultValue={draft.email ?? ownerEmail}
          hint="Shown to customers on invoices. This can differ from your sign-in email."
          inputMode="email"
          label="Invoice contact email"
          maxLength={254}
          name="email"
          required
          spellCheck={false}
          type="email"
        />
        <SetupField
          autoComplete="tel"
          defaultValue={draft.phone ?? ""}
          inputMode="tel"
          label="Phone"
          maxLength={40}
          name="phone"
          placeholder="Optional"
          type="tel"
        />
        <div className="sm:col-span-2">
          <SetupField
            defaultValue={draft.taxId ?? ""}
            hint="VAT, GST, ABN, EIN, or another identifier shown on invoices."
            label="Tax identifier"
            maxLength={80}
            name="taxId"
            placeholder="Optional"
          />
        </div>
      </div>
    </section>
  )
}
