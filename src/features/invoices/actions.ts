"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { InvoiceAggregateConflictError } from "@/features/invoices/aggregate";
import {
  FormSubmissionError,
  parseInvoiceFormData,
  type InvoiceActionState,
} from "@/features/invoices/forms";
import {
  createInvoice,
  deleteDraftInvoice,
  issueInvoice,
  updateDraftSeller,
  updateInvoice,
} from "@/features/invoices/service";
import { PaymentAllocationError } from "@/features/payments/invoice-allocation";
import { requireBusiness, requireSession } from "@/lib/session";

function readId(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim() || value.length > 100) {
    throw new FormSubmissionError("The invoice could not be identified");
  }
  return value;
}

function actionError(error: unknown): InvoiceActionState {
  if (error instanceof FormSubmissionError) return { error: error.message };
  if (error instanceof InvoiceAggregateConflictError) return { error: error.message };
  if (error instanceof PaymentAllocationError) return { error: error.message };
  throw error;
}

export async function createInvoiceAction(
  _state: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const business = await requireBusiness();
  let invoiceId: string;

  try {
    invoiceId = await createInvoice(business, parseInvoiceFormData(formData));
  } catch (error) {
    return actionError(error);
  }

  revalidatePath("/invoices");
  revalidatePath("/");
  redirect(`/invoices/${invoiceId}`);
}

export async function updateInvoiceAction(
  _state: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const business = await requireBusiness();
  const session = await requireSession();
  let invoiceId: string;

  try {
    invoiceId = readId(formData, "invoiceId");
    await updateInvoice(business, invoiceId, parseInvoiceFormData(formData), {
      expectedUpdatedAt: readId(formData, "expectedUpdatedAt"),
      confirmed: formData.get("publishedEditConfirmed") === "on",
      refreshCustomerDetails: formData.get("refreshCustomerDetails") === "on",
      actorName: session.user.name,
    });
  } catch (error) {
    return actionError(error);
  }

  revalidatePath("/", "layout");
  redirect(`/invoices/${invoiceId}`);
}

export async function updateDraftSellerAction(formData: FormData) {
  const business = await requireBusiness();
  const invoiceId = readId(formData, "invoiceId");
  await updateDraftSeller(business, invoiceId);

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  redirect(`/invoices/${invoiceId}`);
}

export async function issueInvoiceAction(formData: FormData) {
  const business = await requireBusiness();
  const invoiceId = readId(formData, "invoiceId");
  await issueInvoice(business, invoiceId);

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/payments");
  revalidatePath("/");
  redirect(`/invoices/${invoiceId}`);
}

export async function deleteDraftInvoiceAction(formData: FormData) {
  const business = await requireBusiness();
  const invoiceId = readId(formData, "invoiceId");
  await deleteDraftInvoice(business, invoiceId);

  revalidatePath("/invoices");
  revalidatePath("/");
  redirect("/invoices");
}
