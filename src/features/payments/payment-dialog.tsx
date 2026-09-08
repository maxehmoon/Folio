"use client";

import { Plus } from "@/components/ui/icons";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CustomerAvatar } from "@/features/customers/customer-avatar";
import type { PaymentActionState } from "@/features/payments/forms";
import type { PayableInvoice } from "@/features/payments/types";
import { formatMoney } from "@/lib/format";

type PaymentFormAction = (
  state: PaymentActionState,
  formData: FormData,
) => Promise<PaymentActionState>;

function SubmitPaymentButton() {
  const { pending } = useFormStatus();
  return (
    <Button className="text-[13px]" disabled={pending} type="submit">
      {pending ? "Recording…" : "Record payment"}
    </Button>
  );
}

export function PaymentDialog({
  action,
  invoices,
  initialInvoiceId,
  defaultOpen = false,
  today,
}: {
  action: PaymentFormAction;
  defaultOpen?: boolean;
  invoices: PayableInvoice[];
  initialInvoiceId?: string;
  today: string;
}) {
  const firstInvoiceId =
    (initialInvoiceId && invoices.some((invoice) => invoice.id === initialInvoiceId)
      ? initialInvoiceId
      : invoices[0]?.id) ?? "";
  const [invoiceId, setInvoiceId] = useState(firstInvoiceId);
  const initialInvoice = invoices.find((invoice) => invoice.id === firstInvoiceId);
  const [amount, setAmount] = useState(
    initialInvoice ? (initialInvoice.balanceDueCents / 100).toFixed(2) : "",
  );
  const [state, formAction] = useActionState(action, {});

  function chooseInvoice(value: string) {
    setInvoiceId(value);
    const invoice = invoices.find((candidate) => candidate.id === value);
    setAmount(invoice ? (invoice.balanceDueCents / 100).toFixed(2) : "");
  }

  const selectedInvoice = invoices.find((invoice) => invoice.id === invoiceId);

  return (
    <Dialog defaultOpen={defaultOpen}>
      <DialogTrigger asChild>
        <Button
          className="text-[13px]"
          disabled={invoices.length === 0}
        >
          <Plus aria-hidden="true" className="size-[14px]" />
          Record payment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-[14px]">Record payment</DialogTitle>
          <DialogDescription>
            Apply a payment to an issued invoice. The amount cannot exceed the
            balance due.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input name="currency" type="hidden" value={selectedInvoice?.currency ?? ""} />
          {state.error ? (
            <p
              aria-live="polite"
              className="rounded-xl bg-destructive/5 px-3 py-2 text-[13px] text-destructive"
              role="alert"
            >
              {state.error}
            </p>
          ) : null}
          {state.success ? (
            <p
              aria-live="polite"
              className="rounded-xl bg-success-background px-3 py-2 text-[13px] text-success"
              role="status"
            >
              {state.success}
            </p>
          ) : null}

          <div className="space-y-2">
            <Label className="text-[13px] text-foreground" htmlFor="payment-invoice">
              Invoice
            </Label>
            <SearchableSelect
              id="payment-invoice"
              name="invoiceId"
              onValueChange={chooseInvoice}
              options={invoices.map((invoice) => ({
                description: `${invoice.customerName} · ${formatMoney(invoice.balanceDueCents, invoice.currency)} due`,
                icon: (
                  <CustomerAvatar
                    className="size-8 text-[10px]"
                    name={invoice.customerName}
                  />
                ),
                keywords: `${invoice.customerName} ${invoice.invoiceNumber}`,
                label: invoice.invoiceNumber,
                value: invoice.id,
              }))}
              placeholder="Choose an invoice…"
              searchPlaceholder="Search invoices…"
              value={invoiceId}
            />
            {selectedInvoice ? (
              <p className="text-[12px] text-subtle-foreground">
                {formatMoney(
                  selectedInvoice.balanceDueCents,
                  selectedInvoice.currency,
                )}{" "}
                due
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-[13px] text-foreground" htmlFor="payment-date">
                Payment date
              </Label>
              <DatePicker
                defaultValue={today}
                id="payment-date"
                name="paymentDate"
                required
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[13px] text-foreground" htmlFor="payment-amount">
                Amount
              </Label>
              <Input
                id="payment-amount"
                min="0.01"
                name="amount"
                onChange={(event) => setAmount(event.target.value)}
                required
                step="0.01"
                type="number"
                value={amount}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[13px] text-foreground" htmlFor="payment-method">
              Method
            </Label>
            <Select defaultValue="bank_transfer" name="method">
              <SelectTrigger className="w-full text-[13px]" id="payment-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-[13px] text-foreground" htmlFor="payment-reference">
              Reference
            </Label>
            <Input id="payment-reference" maxLength={200} name="reference" />
          </div>

          <div className="space-y-2">
            <Label className="text-[13px] text-foreground" htmlFor="payment-notes">
              Notes
            </Label>
            <Textarea id="payment-notes" maxLength={2_000} name="notes" rows={3} />
          </div>

          <DialogFooter>
            <SubmitPaymentButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
