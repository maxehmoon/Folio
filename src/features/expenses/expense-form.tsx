"use client";

import Image from "next/image";
import Link from "next/link";
import { FileImage, ImagePlus, Trash2 } from "@/components/ui/icons";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { Expense } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { INVOICE_CURRENCIES } from "@/lib/currencies";
import {
  emptyExpenseFormState,
  type ExpenseFormField,
  type ExpenseFormState,
} from "@/features/expenses/form-state";
import {
  expenseReceipt,
  receiptImageUpload,
  type ExpenseReceipt,
} from "@/features/expenses/receipt";
import { useImageUploadPreview } from "@/components/folio/use-image-upload-preview";
import { IMAGE_UPLOAD_ACCEPT } from "@/lib/image-upload";
import { FormField } from "@/components/folio/form-field";
import { useFocusFirstInvalid } from "@/components/folio/use-focus-first-invalid";

type ExpenseFormAction = (
  state: ExpenseFormState,
  formData: FormData,
) => Promise<ExpenseFormState>;

type ExpenseDefaults = Pick<
  Expense,
  | "vendor"
  | "category"
  | "description"
  | "expense_date"
  | "currency"
  | "subtotal_cents"
  | "tax_cents"
  | "reference"
  | "notes"
  | "receipt_url"
  | "receipt_data_url"
>;

type ExpenseFormProps = {
  action: ExpenseFormAction;
  cancelHref: string;
  currency: string;
  defaultDate: string;
  expense?: ExpenseDefaults;
};

function fieldA11y(error: string[] | undefined, name: string, hasHint = false) {
  return {
    "aria-describedby": error?.[0]
      ? `${name}-error`
      : hasHint
        ? `${name}-hint`
        : undefined,
    "aria-invalid": error?.[0] ? (true as const) : undefined,
  };
}

function centsInput(cents: number | undefined, fallback = "0.00") {
  return cents === undefined ? fallback : (cents / 100).toFixed(2);
}

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button className="text-[13px]" disabled={pending} type="submit">
      {pending ? "Saving…" : editing ? "Save changes" : "Create expense"}
    </Button>
  );
}

function ReceiptImageField({
  currentReceipt,
  error,
}: {
  currentReceipt: ExpenseReceipt;
  error?: string[];
}) {
  const {
    chooseFile,
    inputRef,
    message,
    preview,
    remove: removeReceipt,
    removed,
  } = useImageUploadPreview({
    config: receiptImageUpload,
    initialPreview:
      currentReceipt?.kind === "image" ? currentReceipt.url : null,
  });
  const hasCurrentReceipt = Boolean(currentReceipt);

  const fieldError = error?.[0] ?? message;

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label className="text-[13px] text-foreground" htmlFor="receipt_image">
        Receipt image
      </Label>
      <div className="flex flex-col gap-3 rounded-2xl bg-surface-subtle p-3.5 sm:flex-row sm:items-center">
        <div className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted text-muted-foreground">
          {preview ? (
            <Image
              alt="Receipt preview"
              className="object-cover"
              fill
              sizes="64px"
              src={preview}
              unoptimized
            />
          ) : (
            <FileImage aria-hidden="true" className="size-6" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-foreground">
            {preview ? "Receipt ready to upload" : "Add a receipt photo"}
          </p>
          <p className="mt-0.5 text-[12px] leading-4 text-subtle-foreground">
            PNG, JPEG or WebP, up to 512 KB.
          </p>
          {currentReceipt?.kind === "legacy-link" && !preview && !removed ? (
            <a
              className="mt-1.5 inline-flex items-center text-[12px] text-muted-foreground underline underline-offset-4 hover:text-foreground"
              href={currentReceipt.url}
              rel="noreferrer"
              target="_blank"
            >
              Open existing receipt link
            </a>
          ) : null}
          {fieldError ? (
            <p className="mt-1.5 text-[12px] leading-4 text-destructive" id="receipt_image-error">
              {fieldError}
            </p>
          ) : null}
        </div>
        <input
          accept={IMAGE_UPLOAD_ACCEPT}
          aria-describedby={fieldError ? "receipt_image-error" : undefined}
          aria-invalid={fieldError ? true : undefined}
          className="sr-only"
          id="receipt_image"
          name="receipt_image"
          onChange={(event) => chooseFile(event.currentTarget.files?.[0])}
          ref={inputRef}
          type="file"
        />
        {removed ? <input name="remove_receipt_image" type="hidden" value="1" /> : null}
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <label className="cursor-pointer" htmlFor="receipt_image">
              <ImagePlus aria-hidden="true" />
              {preview ? "Replace" : "Upload"}
            </label>
          </Button>
          {preview || (hasCurrentReceipt && !removed) ? (
            <Button
              aria-label="Remove receipt image"
              className="rounded-full"
              onClick={removeReceipt}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Trash2 aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ExpenseForm({
  action,
  cancelHref,
  currency,
  defaultDate,
  expense,
}: ExpenseFormProps) {
  const [state, formAction] = useActionState(action, emptyExpenseFormState);
  const formRef = useFocusFirstInvalid(state.errors);
  const errors = state.errors ?? {};
  const value = (field: ExpenseFormField, initial?: string | null) =>
    state.values?.[field] ?? initial ?? "";

  return (
    <form
      action={formAction}
      className="space-y-4 [&_[data-slot=input]]:text-[14px] [&_[data-slot=textarea]]:text-[14px]"
      ref={formRef}
    >
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
            <h2>Expense details</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormField
              error={errors.vendor?.[0]}
              htmlFor="vendor"
              label="Vendor"
              required
            >
              <Input
                {...fieldA11y(errors.vendor, "vendor")}
                autoComplete="organization"
                defaultValue={value("vendor", expense?.vendor)}
                id="vendor"
                maxLength={160}
                name="vendor"
                required
              />
            </FormField>
          </div>
          <FormField
            error={errors.category?.[0]}
            htmlFor="category"
            label="Category"
            required
          >
            <Input
              {...fieldA11y(errors.category, "category")}
              defaultValue={value("category", expense?.category)}
              id="category"
              list="expense-categories"
              maxLength={80}
              name="category"
              placeholder="Software…"
              required
            />
            <datalist id="expense-categories">
              <option value="Advertising" />
              <option value="Equipment" />
              <option value="Insurance" />
              <option value="Office" />
              <option value="Professional services" />
              <option value="Software" />
              <option value="Travel" />
              <option value="Utilities" />
            </datalist>
          </FormField>
          <FormField
            error={errors.expense_date?.[0]}
            htmlFor="expense_date"
            label="Expense date"
            required
          >
            <DatePicker
              {...fieldA11y(errors.expense_date, "expense_date")}
              defaultValue={value("expense_date", expense?.expense_date ?? defaultDate)}
              id="expense_date"
              name="expense_date"
              required
            />
          </FormField>
          <div className="sm:col-span-2">
            <FormField error={errors.description?.[0]} htmlFor="description" label="Description">
              <Textarea
                {...fieldA11y(errors.description, "description")}
                defaultValue={value("description", expense?.description)}
                id="description"
                maxLength={500}
                name="description"
                rows={3}
              />
            </FormField>
          </div>
          <FormField error={errors.reference?.[0]} htmlFor="reference" label="Reference">
            <Input
              {...fieldA11y(errors.reference, "reference")}
              defaultValue={value("reference", expense?.reference)}
              id="reference"
              maxLength={120}
              name="reference"
            />
          </FormField>
          <ReceiptImageField
            currentReceipt={expense ? expenseReceipt(expense) : null}
            error={errors.receipt_image}
          />
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-none ring-1 ring-border">
        <CardHeader className="border-b border-border">
          <CardTitle className="text-[14px] text-foreground">
            <h2>Amount</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-3">
          <FormField
            error={errors.subtotal?.[0]}
            htmlFor="subtotal"
            label="Subtotal"
            required
          >
            <Input
              {...fieldA11y(errors.subtotal, "subtotal")}
              autoComplete="off"
              defaultValue={value("subtotal", centsInput(expense?.subtotal_cents))}
              id="subtotal"
              inputMode="decimal"
              min="0"
              name="subtotal"
              required
              step="0.01"
              type="number"
            />
          </FormField>
          <FormField error={errors.tax?.[0]} htmlFor="tax" label="Tax" required>
            <Input
              {...fieldA11y(errors.tax, "tax")}
              autoComplete="off"
              defaultValue={value("tax", centsInput(expense?.tax_cents))}
              id="tax"
              inputMode="decimal"
              min="0"
              name="tax"
              required
              step="0.01"
              type="number"
            />
          </FormField>
          <FormField
            error={errors.currency?.[0]}
            htmlFor="currency"
            label="Currency"
            required
          >
            <SearchableSelect
              {...fieldA11y(errors.currency, "currency")}
              defaultValue={value("currency", expense?.currency ?? currency)}
              id="currency"
              name="currency"
              options={INVOICE_CURRENCIES.map((option) => ({
                description: option.name,
                keywords: option.name,
                label: option.code,
                value: option.code,
              }))}
              placeholder="Choose a currency…"
              required
              searchPlaceholder="Search currencies…"
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
          <FormField
            error={errors.notes?.[0]}
            hint="Notes stay inside Folio and do not appear on invoices."
            htmlFor="notes"
            label="Notes"
          >
            <Textarea
              {...fieldA11y(errors.notes, "notes", true)}
              defaultValue={value("notes", expense?.notes)}
              id="notes"
              maxLength={2_000}
              name="notes"
              rows={5}
            />
          </FormField>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button asChild className="rounded-full text-[13px]" variant="ghost">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <SubmitButton editing={Boolean(expense)} />
      </div>
    </form>
  );
}
