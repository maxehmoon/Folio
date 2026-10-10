"use server";

import { revalidatePath } from "next/cache";

import {
  PaymentFormError,
  parsePaymentFormData,
  type PaymentActionState,
} from "@/features/payments/forms";
import { db } from "@/lib/db";
import { requireBusiness } from "@/lib/session";
import { deletePayment, recordPayment } from "./service";

export async function recordPaymentAction(
  _state: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const business = await requireBusiness();

  try {
    const input = parsePaymentFormData(formData);

    await recordPayment(db, business.id, input);

    revalidatePath("/invoices");
    revalidatePath(`/invoices/${input.invoiceId}`);
    revalidatePath("/payments");
    revalidatePath("/");
    return { success: "Payment recorded" };
  } catch (error) {
    if (error instanceof PaymentFormError) return { error: error.message };
    throw error;
  }
}

export async function deletePaymentAction(formData: FormData) {
  const business = await requireBusiness();
  const value = formData.get("paymentId");
  if (typeof value !== "string" || !value.trim() || value.length > 100) return;

  const payment = await deletePayment(db, business.id, value);
  if (!payment) return;

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${payment.invoice_id}`);
  revalidatePath("/payments");
  revalidatePath("/");
}
