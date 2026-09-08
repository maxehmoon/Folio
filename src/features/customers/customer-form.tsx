"use client";

import { Upload } from "@/components/ui/icons";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";

import type { Customer } from "@/lib/db/types";
import type {
  CustomerField,
  CustomerFormState,
} from "@/features/customers/form-state";
import { emptyCustomerFormState } from "@/features/customers/form-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { COUNTRIES } from "@/lib/countries";
import { INVOICE_CURRENCIES } from "@/lib/currencies";
import { CustomerAvatar } from "@/features/customers/customer-avatar";
import { customerAvatarUpload } from "@/features/customers/avatar";
import { FormField } from "@/components/folio/form-field";
import { useFocusFirstInvalid } from "@/components/folio/use-focus-first-invalid";
import { useImageUploadPreview } from "@/components/folio/use-image-upload-preview";
import { IMAGE_UPLOAD_ACCEPT } from "@/lib/image-upload";

type CustomerFormAction = (
  state: CustomerFormState,
  formData: FormData,
) => Promise<CustomerFormState>;

type CustomerDefaults = Pick<
  Customer,
  | "id"
  | "name"
  | "billing_name"
  | "avatar_data_url"
  | "default_currency"
  | "contact_name"
  | "email"
  | "phone"
  | "tax_id"
  | "address_line_1"
  | "address_line_2"
  | "city"
  | "region"
  | "postal_code"
  | "country_code"
  | "notes"
>;

type CustomerFormProps = {
  action: CustomerFormAction;
  cancelHref: string;
  customer?: CustomerDefaults;
};

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button className="text-[13px]" disabled={pending} type="submit">
      {pending ? "Saving…" : editing ? "Save changes" : "Create customer"}
    </Button>
  );
}

function fieldA11y(error: string[] | undefined, name: string) {
  return {
    "aria-describedby": error?.[0] ? `${name}-error` : undefined,
    "aria-invalid": error?.[0] ? (true as const) : undefined,
  };
}

export function CustomerForm({ action, cancelHref, customer }: CustomerFormProps) {
  const [state, formAction] = useActionState(action, emptyCustomerFormState);
  const formRef = useFocusFirstInvalid(state.errors);
  const {
    chooseFile: previewAvatar,
    inputRef: avatarInputRef,
    message: avatarMessage,
    preview: avatarPreview,
    remove: removeCustomerAvatar,
    removed: removeAvatar,
  } = useImageUploadPreview({
    config: customerAvatarUpload,
    initialPreview: customer?.avatar_data_url,
  });
  const errors = state.errors ?? {};
  const avatarError = errors.avatar?.[0] ?? avatarMessage;
  const value = (field: CustomerField, initial?: string | null) =>
    state.values?.[field] ?? initial ?? "";

  return (
    <form
      action={formAction}
      className="space-y-4 [&_[data-slot=input]]:text-[14px] [&_[data-slot=textarea]]:text-[14px]"
      ref={formRef}
    >
      {customer ? <input name="id" type="hidden" value={customer.id} /> : null}
      {removeAvatar ? <input name="remove_avatar" type="hidden" value="1" /> : null}

      {state.message ? (
        <div
          aria-live="polite"
          className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-[13px] text-destructive"
          role="alert"
        >
          {state.message}
        </div>
      ) : null}

      <Card className="rounded-2xl shadow-none ring-1 ring-border">
        <CardHeader className="border-b border-border">
          <CardTitle className="text-[14px] text-foreground">
            <h2>Customer details</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-subtle p-3.5 sm:col-span-2 sm:flex-row sm:items-center">
            <CustomerAvatar
              className="size-14 border bg-card text-[14px]"
              imageUrl={avatarPreview}
              name={value("name", customer?.name) || "Customer"}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-foreground">Customer icon</p>
              <p className="mt-0.5 text-[12px] text-subtle-foreground">
                PNG, JPEG or WebP, up to 512 KB.
              </p>
              {avatarError ? (
                <p className="mt-1 text-[12px] text-destructive" id="avatar-error">
                  {avatarError}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Label
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border bg-card px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring"
                htmlFor="avatar"
              >
                <Upload aria-hidden="true" className="size-[14px]" />
                Upload
              </Label>
              <input
                accept={IMAGE_UPLOAD_ACCEPT}
                aria-describedby={avatarError ? "avatar-error" : undefined}
                aria-invalid={avatarError ? true : undefined}
                className="sr-only"
                id="avatar"
                name="avatar"
                onChange={(event) => previewAvatar(event.currentTarget.files?.[0])}
                ref={avatarInputRef}
                type="file"
              />
              {avatarPreview ? (
                <Button
                  className="rounded-full text-[12px]"
                  onClick={removeCustomerAvatar}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
          <div className="sm:col-span-2">
            <FormField
              error={errors.name?.[0]}
              htmlFor="name"
              label="Customer or business name"
              required
            >
              <Input
                {...fieldA11y(errors.name, "name")}
                autoComplete="organization"
                defaultValue={value("name", customer?.name)}
                id="name"
                maxLength={160}
                name="name"
                required
              />
            </FormField>
          </div>
          <FormField
            className="sm:col-span-2"
            error={errors.billing_name?.[0]}
            hint="The organisation or recipient shown on invoices. Leave blank to use the customer name."
            htmlFor="billing_name"
            label="Billing name"
          >
            <Input
              {...fieldA11y(errors.billing_name, "billing_name")}
              aria-describedby={errors.billing_name?.[0] ? "billing_name-error" : "billing_name-hint"}
              autoComplete="billing organization"
              defaultValue={value("billing_name", customer?.billing_name)}
              id="billing_name"
              maxLength={160}
              name="billing_name"
            />
          </FormField>
          <FormField error={errors.contact_name?.[0]} htmlFor="contact_name" label="Contact name">
            <Input
              {...fieldA11y(errors.contact_name, "contact_name")}
              autoComplete="name"
              defaultValue={value("contact_name", customer?.contact_name)}
              id="contact_name"
              maxLength={160}
              name="contact_name"
            />
          </FormField>
          <FormField error={errors.email?.[0]} htmlFor="email" label="Email">
            <Input
              {...fieldA11y(errors.email, "email")}
              autoComplete="email"
              defaultValue={value("email", customer?.email)}
              id="email"
              maxLength={254}
              name="email"
              spellCheck={false}
              type="email"
            />
          </FormField>
          <FormField error={errors.phone?.[0]} htmlFor="phone" label="Phone">
            <Input
              {...fieldA11y(errors.phone, "phone")}
              autoComplete="tel"
              defaultValue={value("phone", customer?.phone)}
              id="phone"
              maxLength={40}
              name="phone"
              type="tel"
            />
          </FormField>
          <FormField error={errors.tax_id?.[0]} htmlFor="tax_id" label="Tax ID">
            <Input
              {...fieldA11y(errors.tax_id, "tax_id")}
              defaultValue={value("tax_id", customer?.tax_id)}
              id="tax_id"
              maxLength={80}
              name="tax_id"
              spellCheck={false}
            />
          </FormField>
          <FormField
            error={errors.default_currency?.[0]}
            htmlFor="default_currency"
            label="Default invoice currency"
          >
            <SearchableSelect
              {...fieldA11y(errors.default_currency, "default_currency")}
              defaultValue={value(
                "default_currency",
                customer?.default_currency,
              )}
              id="default_currency"
              name="default_currency"
              options={[
                { label: "Use business default", value: "" },
                ...INVOICE_CURRENCIES.map((currency) => ({
                  description: currency.name,
                  keywords: currency.name,
                  label: currency.code,
                  value: currency.code,
                })),
              ]}
              placeholder="Use business default"
              searchPlaceholder="Search currencies…"
            />
          </FormField>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-none ring-1 ring-border">
        <CardHeader className="border-b border-border">
          <CardTitle className="text-[14px] text-foreground">
            <h2>Billing address</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormField error={errors.address_line_1?.[0]} htmlFor="address_line_1" label="Address line 1">
              <Input
                {...fieldA11y(errors.address_line_1, "address_line_1")}
                autoComplete="address-line1"
                defaultValue={value("address_line_1", customer?.address_line_1)}
                id="address_line_1"
                maxLength={200}
                name="address_line_1"
              />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormField error={errors.address_line_2?.[0]} htmlFor="address_line_2" label="Address line 2">
              <Input
                {...fieldA11y(errors.address_line_2, "address_line_2")}
                autoComplete="address-line2"
                defaultValue={value("address_line_2", customer?.address_line_2)}
                id="address_line_2"
                maxLength={200}
                name="address_line_2"
              />
            </FormField>
          </div>
          <FormField error={errors.city?.[0]} htmlFor="city" label="City">
            <Input
              {...fieldA11y(errors.city, "city")}
              autoComplete="address-level2"
              defaultValue={value("city", customer?.city)}
              id="city"
              maxLength={120}
              name="city"
            />
          </FormField>
          <FormField error={errors.region?.[0]} htmlFor="region" label="Region / state">
            <Input
              {...fieldA11y(errors.region, "region")}
              autoComplete="address-level1"
              defaultValue={value("region", customer?.region)}
              id="region"
              maxLength={120}
              name="region"
            />
          </FormField>
          <FormField error={errors.postal_code?.[0]} htmlFor="postal_code" label="Postal code">
            <Input
              {...fieldA11y(errors.postal_code, "postal_code")}
              autoComplete="postal-code"
              defaultValue={value("postal_code", customer?.postal_code)}
              id="postal_code"
              maxLength={32}
              name="postal_code"
            />
          </FormField>
          <FormField error={errors.country_code?.[0]} htmlFor="country_code" label="Country">
            <SearchableSelect
              {...fieldA11y(errors.country_code, "country_code")}
              defaultValue={value("country_code", customer?.country_code)}
              id="country_code"
              name="country_code"
              options={[
                { label: "No country selected", value: "" },
                ...COUNTRIES.map((country) => ({
                  description: country.code,
                  label: country.name,
                  value: country.code,
                })),
              ]}
              placeholder="Choose a country…"
              searchPlaceholder="Search countries…"
            />
          </FormField>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-none ring-1 ring-border">
        <CardHeader className="border-b border-border">
          <CardTitle className="text-[14px] text-foreground">
            <h2>Internal notes</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FormField error={errors.notes?.[0]} htmlFor="notes" label="Notes">
            <Textarea
              {...fieldA11y(errors.notes, "notes")}
              defaultValue={value("notes", customer?.notes)}
              id="notes"
              maxLength={2_000}
              name="notes"
              rows={5}
            />
          </FormField>
          <p className="mt-2 text-[12px] text-subtle-foreground">
            Notes are private and never appear on invoices.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button asChild className="rounded-full text-[13px]" variant="ghost">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <SubmitButton editing={Boolean(customer)} />
      </div>
    </form>
  );
}
