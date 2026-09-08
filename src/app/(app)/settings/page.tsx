import { BusinessIconField } from "@/components/auth/business-icon-field";
import { OwnerAccountSettings } from "@/components/auth/owner-account-settings";
import { PageHeader } from "@/components/folio/page-header";
import { VerticalSlidingTabBar } from "@/components/folio/sliding-tab-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { COUNTRIES } from "@/lib/countries";
import { INVOICE_CURRENCIES } from "@/lib/currencies";
import { requireBusiness, requireSession } from "@/lib/session";
import { formatTimezoneLabel, SUPPORTED_TIMEZONES } from "@/lib/timezones";

import { updateSettings } from "./actions";
import { SettingsForm } from "./settings-form";

const settingsSections = [
  ["identity", "Business identity"],
  ["address", "Address"],
  ["defaults", "Invoice defaults"],
  ["account", "Owner account"],
] as const;

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue ?? ""} required={required} />
    </div>
  );
}

export default async function SettingsPage() {
  const [business, session] = await Promise.all([
    requireBusiness(),
    requireSession(),
  ]);

  return (
    <div className="space-y-7">
      <PageHeader title="Settings" description="Business details and defaults copied to new invoices." />

      <div className="grid gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="lg:self-start">
          <VerticalSlidingTabBar
            aria-label="Settings sections"
            className="rounded-[16px] bg-card p-2"
          >
            {settingsSections.map(([id, label], index) => (
              <a
                className={`relative z-10 block rounded-xl px-3 py-2 text-[13px] motion-safe:transition-[color,transform] motion-safe:duration-150 motion-safe:active:scale-[0.98] ${index === 0 ? "font-medium text-foreground" : "text-muted-foreground"}`}
                data-sliding-tab
                href={`#${id}`}
                key={id}
              >
                {label}
              </a>
            ))}
          </VerticalSlidingTabBar>
        </aside>

        <div className="min-w-0 space-y-4">
      <SettingsForm action={updateSettings}>
        <Card className="scroll-mt-24 rounded-[16px] shadow-none" id="identity">
          <CardHeader>
            <CardTitle className="text-[14px]">Business identity</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <BusinessIconField
                initialImageUrl={business.logo_url}
              />
            </div>
            <Field label="Trading name" name="name" defaultValue={business.name} required />
            <Field label="Legal name" name="legalName" defaultValue={business.legal_name} />
            <Field label="Email" name="email" type="email" defaultValue={business.email} required />
            <Field label="Phone" name="phone" type="tel" defaultValue={business.phone} />
            <Field label="Tax identifier" name="taxId" defaultValue={business.tax_id} />
          </CardContent>
        </Card>

        <Card className="scroll-mt-24 rounded-[16px] shadow-none" id="address">
          <CardHeader>
            <CardTitle className="text-[14px]">Address</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Address line 1" name="addressLine1" defaultValue={business.address_line_1} /></div>
            <div className="sm:col-span-2"><Field label="Address line 2" name="addressLine2" defaultValue={business.address_line_2} /></div>
            <Field label="City" name="city" defaultValue={business.city} />
            <Field label="Region" name="region" defaultValue={business.region} />
            <Field label="Postcode" name="postalCode" defaultValue={business.postal_code} />
            <div className="grid gap-1.5">
              <Label htmlFor="countryCode">Country</Label>
              <SearchableSelect
                defaultValue={business.country_code ?? "GB"}
                id="countryCode"
                name="countryCode"
                options={COUNTRIES.map((country) => ({
                  keywords: country.code,
                  label: country.name,
                  value: country.code,
                }))}
                placeholder="Choose a country…"
                required
                searchPlaceholder="Search countries…"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="scroll-mt-24 rounded-[16px] shadow-none" id="defaults">
          <CardHeader>
            <CardTitle className="text-[14px]">Invoice defaults</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="currency">Currency</Label>
              <SearchableSelect
                defaultValue={business.currency}
                id="currency"
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
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="timezone">Timezone</Label>
              <SearchableSelect
                defaultValue={business.timezone}
                id="timezone"
                name="timezone"
                options={SUPPORTED_TIMEZONES.map((timezone) => ({
                  description: timezone,
                  label: formatTimezoneLabel(timezone),
                  value: timezone,
                }))}
                placeholder="Choose a timezone…"
                required
                searchPlaceholder="Search timezones…"
              />
            </div>
            <Field label="Invoice prefix" name="invoicePrefix" defaultValue={business.invoice_prefix} required />
            <Field label="Payment terms (days)" name="paymentTermsDays" type="number" defaultValue={business.default_payment_terms_days} required />
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="paymentInstructions">Payment instructions</Label>
              <Textarea id="paymentInstructions" name="paymentInstructions" defaultValue={business.payment_instructions ?? ""} rows={4} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="invoiceFooter">Invoice footer</Label>
              <Textarea id="invoiceFooter" name="invoiceFooter" defaultValue={business.invoice_footer ?? ""} rows={3} />
            </div>
          </CardContent>
        </Card>

        <OwnerAccountSettings
          email={session.user.email}
          name={session.user.name}
        />
      </SettingsForm>
        </div>
      </div>
    </div>
  );
}
