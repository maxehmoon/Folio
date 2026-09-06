"use client";

import { Package2, Plus, Trash2 } from "@/components/ui/icons";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { CustomerAvatar } from "@/features/customers/customer-avatar";
import type { InvoiceActionState } from "@/features/invoices/forms";
import type {
  InvoiceEditorCustomer,
  InvoiceEditorInitialValues,
  InvoiceEditorItem,
} from "@/features/invoices/types";
import { useInvoiceLines } from "@/features/invoices/use-invoice-lines";
import { INVOICE_CURRENCIES } from "@/lib/currencies";
import { formatMoney } from "@/lib/format";

type InvoiceFormAction = (
  state: InvoiceActionState,
  formData: FormData,
) => Promise<InvoiceActionState>;

type InvoiceEditorProps = {
  action: InvoiceFormAction;
  baseCurrency: string;
  cancelHref: string;
  customers: InvoiceEditorCustomer[];
  initialValues: InvoiceEditorInitialValues;
  invoiceId?: string;
  items: InvoiceEditorItem[];
};

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button className="text-[13px]" disabled={pending} type="submit">
      {pending ? "Saving…" : editing ? "Save changes" : "Create draft"}
    </Button>
  );
}

export function InvoiceEditor({
  action,
  baseCurrency,
  cancelHref,
  customers,
  initialValues,
  invoiceId,
  items,
}: InvoiceEditorProps) {
  const [state, formAction] = useActionState(action, {});
  const lineEditor = useInvoiceLines({
    initialCurrency: initialValues.currency,
    initialLines: initialValues.lines,
    items,
  });
  const [customerId, setCustomerId] = useState(initialValues.customerId);
  const {
    addLine,
    changeCurrency,
    currency,
    estimates,
    exchangeError,
    exchangeNotice,
    lines,
    removeLine,
    selectItem,
    serialisedLines,
    totals,
    updateLine,
  } = lineEditor;

  function changeCustomer(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    const customer = customers.find((candidate) => candidate.id === nextCustomerId);
    if (customer?.default_currency) changeCurrency(customer.default_currency);
  }

  return (
    <form action={formAction} className="space-y-4">
      {invoiceId ? <input name="invoiceId" type="hidden" value={invoiceId} /> : null}
      <input name="lines" type="hidden" value={serialisedLines} />

      {state.error ? (
        <div
          aria-live="polite"
          className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-[13px] text-destructive"
          role="alert"
        >
          {state.error}
        </div>
      ) : null}

      <Card className="rounded-2xl shadow-none ring-1 ring-border">
        <CardHeader className="border-b border-border">
          <CardTitle className="text-[14px] text-foreground">Invoice details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-3">
            <Label className="text-[13px] text-foreground" htmlFor="customerId">
              Customer
            </Label>
            <SearchableSelect
              id="customerId"
              name="customerId"
              onValueChange={changeCustomer}
              options={customers.map((customer) => ({
                description:
                  customer.email ??
                  (customer.default_currency
                    ? `Default currency: ${customer.default_currency}`
                    : undefined),
                icon: (
                  <CustomerAvatar
                    className="size-8 text-[10px]"
                    imageUrl={customer.avatar_data_url}
                    name={customer.name}
                  />
                ),
                label: customer.name,
                value: customer.id,
              }))}
              placeholder="Choose a customer…"
              required
              searchPlaceholder="Search customers…"
              value={customerId}
            />
            {customers.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                Add a customer before saving this draft.{" "}
                <Link className="font-medium underline underline-offset-4" href="/customers/new">
                  New customer
                </Link>
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label className="text-[13px] text-foreground" htmlFor="issueDate">
              Issue date
            </Label>
            <DatePicker
              defaultValue={initialValues.issueDate}
              id="issueDate"
              name="issueDate"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[13px] text-foreground" htmlFor="dueDate">
              Due date
            </Label>
            <DatePicker
              defaultValue={initialValues.dueDate}
              id="dueDate"
              name="dueDate"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[13px] text-foreground" htmlFor="currency">
              Currency
            </Label>
            <SearchableSelect
              id="currency"
              name="currency"
              onValueChange={changeCurrency}
              options={INVOICE_CURRENCIES.map((option) => ({
                description: option.name,
                keywords: option.name,
                label: option.code,
                value: option.code,
              }))}
              placeholder="Choose a currency…"
              searchPlaceholder="Search currencies…"
              value={currency}
            />
            <p className="text-[12px] text-subtle-foreground">
              {currency === baseCurrency
                ? "Your business reporting currency."
                : `This invoice will be reported in ${baseCurrency} using a saved reference rate.`}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-none ring-1 ring-border">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border">
          <div>
            <CardTitle className="text-[14px] text-foreground">Line items</CardTitle>
            <p className="mt-1 text-[12px] text-subtle-foreground">
              Saved item prices are converted when their currency differs.
            </p>
          </div>
          <Button
            className="rounded-full text-[12px]"
            onClick={addLine}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Plus aria-hidden="true" className="size-[14px]" />
            Add line
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.map((line, index) => {
            const prefix = `line-${line.key}`;
            return (
              <fieldset
                className="rounded-2xl border border-border p-3"
                key={line.key}
              >
                <legend className="sr-only">Line {index + 1}</legend>
                <div className="grid gap-3 lg:grid-cols-12">
                  <div className="space-y-1.5 lg:col-span-3">
                    <Label className="text-[12px] text-muted-foreground" htmlFor={`${prefix}-item`}>
                      Saved item
                    </Label>
                    <SearchableSelect
                      id={`${prefix}-item`}
                      onValueChange={(value) => void selectItem(line.key, value)}
                      options={[
                        {
                          description: "Enter a custom line",
                          icon: <Plus aria-hidden="true" />,
                          label: "One-off line",
                          value: "ad-hoc",
                        },
                        ...items.map((item) => ({
                          description: [
                            item.description,
                            `${item.currency} · ${item.unit}`,
                          ]
                            .filter(Boolean)
                            .join(" · "),
                          icon: <Package2 aria-hidden="true" />,
                          keywords: item.description ?? undefined,
                          label: item.name,
                          value: item.id,
                        })),
                      ]}
                      searchPlaceholder="Search saved items…"
                      value={line.itemId ?? "ad-hoc"}
                    />
                  </div>
                  <div className="space-y-1.5 lg:col-span-5">
                    <Label className="text-[12px] text-muted-foreground" htmlFor={`${prefix}-description`}>
                      Description
                    </Label>
                    <Input
                      id={`${prefix}-description`}
                      maxLength={500}
                      onChange={(event) => updateLine(line.key, { description: event.target.value })}
                      required
                      value={line.description}
                    />
                  </div>
                  <div className="space-y-1.5 lg:col-span-2">
                    <Label className="text-[12px] text-muted-foreground" htmlFor={`${prefix}-quantity`}>
                      Quantity
                    </Label>
                    <Input
                      id={`${prefix}-quantity`}
                      min="0.001"
                      onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                      required
                      step="0.001"
                      type="number"
                      value={line.quantity}
                    />
                  </div>
                  <div className="space-y-1.5 lg:col-span-2">
                    <Label className="text-[12px] text-muted-foreground" htmlFor={`${prefix}-unit`}>
                      Unit
                    </Label>
                    <Input
                      id={`${prefix}-unit`}
                      maxLength={40}
                      onChange={(event) => updateLine(line.key, { unit: event.target.value })}
                      required
                      value={line.unit}
                    />
                  </div>
                  <div className="space-y-1.5 lg:col-span-3 lg:col-start-6">
                    <Label className="text-[12px] text-muted-foreground" htmlFor={`${prefix}-price`}>
                      Unit price ({currency})
                    </Label>
                    <Input
                      id={`${prefix}-price`}
                      min="0"
                      onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })}
                      required
                      step="0.01"
                      type="number"
                      value={line.unitPrice}
                    />
                  </div>
                  <div className="space-y-1.5 lg:col-span-2">
                    <Label className="text-[12px] text-muted-foreground" htmlFor={`${prefix}-tax`}>
                      Tax rate (%)
                    </Label>
                    <Input
                      id={`${prefix}-tax`}
                      max="100"
                      min="0"
                      onChange={(event) => updateLine(line.key, { taxRate: event.target.value })}
                      required
                      step="0.01"
                      type="number"
                      value={line.taxRate}
                    />
                  </div>
                  <div className="flex items-end justify-between gap-3 lg:col-span-4">
                    <div className="pb-2">
                      <p className="text-[12px] text-subtle-foreground">Line total</p>
                      <p className="mt-0.5 text-[14px] font-medium tabular-nums text-foreground">
                        {formatMoney(estimates[index]?.totalCents ?? 0, currency)}
                      </p>
                    </div>
                    <Button
                      aria-label={`Remove line ${index + 1}`}
                      className="rounded-full text-subtle-foreground hover:text-destructive"
                      disabled={lines.length === 1}
                      onClick={() => removeLine(line.key)}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 aria-hidden="true" className="size-[14px]" />
                    </Button>
                  </div>
                </div>
              </fieldset>
            );
          })}
          {exchangeError ? (
            <p aria-live="polite" className="text-[12px] text-destructive">
              {exchangeError}
            </p>
          ) : exchangeNotice ? (
            <p aria-live="polite" className="text-[12px] text-subtle-foreground">
              {exchangeNotice} Reference rates may differ from your bank’s settlement rate.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="rounded-2xl shadow-none ring-1 ring-border">
          <CardHeader className="border-b border-border">
            <CardTitle className="text-[14px] text-foreground">Notes and payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="text-[13px] text-foreground" htmlFor="notes">
                Notes shown on invoice
              </Label>
              <Textarea
                defaultValue={initialValues.notes}
                id="notes"
                maxLength={5_000}
                name="notes"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[13px] text-foreground" htmlFor="paymentInstructions">
                Payment instructions
              </Label>
              <Textarea
                defaultValue={initialValues.paymentInstructions}
                id="paymentInstructions"
                maxLength={2_000}
                name="paymentInstructions"
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="h-fit rounded-2xl shadow-none ring-1 ring-border">
          <CardHeader className="border-b border-border">
            <CardTitle className="text-[14px] text-foreground">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <dl aria-live="polite" className="space-y-3 text-[13px]">
              <div className="flex justify-between gap-4 text-muted-foreground">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">{formatMoney(totals.subtotalCents, currency)}</dd>
              </div>
              <div className="flex justify-between gap-4 text-muted-foreground">
                <dt>Tax</dt>
                <dd className="tabular-nums">{formatMoney(totals.taxCents, currency)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t pt-3 text-[14px] font-medium text-foreground">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatMoney(totals.totalCents, currency)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button asChild className="rounded-full text-[13px]" variant="ghost">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <SubmitButton editing={Boolean(invoiceId)} />
      </div>
    </form>
  );
}
