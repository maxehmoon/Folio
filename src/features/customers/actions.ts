"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import type { CustomerUpdate, NewCustomer } from "@/lib/db/types";
import { db, newId, nowIso } from "@/lib/db";
import { requireBusiness } from "@/lib/session";
import type {
  CustomerFormState,
  CustomerFormValues,
} from "@/features/customers/form-state";
import {
  customerIdSchema,
  customerSchema,
  type CustomerInput,
} from "@/features/customers/schema";
import { customerAvatarUpload } from "@/features/customers/avatar";
import type { ImageUploadChange } from "@/lib/image-upload";
import { readImageUpload } from "@/lib/read-image-upload";

function fieldsFrom(formData: FormData): CustomerFormValues {
  const text = (name: keyof CustomerFormValues) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };

  return {
    name: text("name"),
    contact_name: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    tax_id: text("tax_id"),
    address_line_1: text("address_line_1"),
    address_line_2: text("address_line_2"),
    city: text("city"),
    region: text("region"),
    postal_code: text("postal_code"),
    country_code: text("country_code"),
    default_currency: text("default_currency"),
    notes: text("notes"),
  };
}

function updateFields(
  input: CustomerInput,
  avatar: Exclude<ImageUploadChange, { kind: "invalid" }>,
): CustomerUpdate {
  return {
    name: input.name,
    contact_name: input.contact_name,
    email: input.email,
    phone: input.phone,
    tax_id: input.tax_id,
    address_line_1: input.address_line_1,
    address_line_2: input.address_line_2,
    city: input.city,
    region: input.region,
    postal_code: input.postal_code,
    country_code: input.country_code,
    default_currency: input.default_currency,
    notes: input.notes,
    ...(avatar.kind === "unchanged"
      ? {}
      : {
          avatar_data_url:
            avatar.kind === "replace" ? avatar.dataUrl : null,
        }),
    updated_at: nowIso(),
  };
}

export async function createCustomer(
  _previousState: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const business = await requireBusiness();
  const values = fieldsFrom(formData);
  const parsed = customerSchema.safeParse(values);

  if (!parsed.success) {
    return {
      message: "Review the highlighted fields.",
      errors: parsed.error.flatten().fieldErrors,
      values,
    };
  }

  const avatar = await readImageUpload(formData, customerAvatarUpload);
  if (avatar.kind === "invalid") {
    return {
      message: "Review the highlighted fields.",
      errors: { avatar: [avatar.error] },
      values,
    };
  }

  const timestamp = nowIso();
  const customer: NewCustomer = {
    id: newId(),
    business_id: business.id,
    ...parsed.data,
    avatar_data_url: avatar.kind === "replace" ? avatar.dataUrl : null,
    archived_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  await db.insertInto("customers").values(customer).execute();

  revalidatePath("/customers");
  redirect(`/customers/${customer.id}`);
}

export async function updateCustomer(
  _previousState: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const business = await requireBusiness();
  const parsedId = customerIdSchema.safeParse(formData.get("id"));
  const values = fieldsFrom(formData);
  const parsed = customerSchema.safeParse(values);

  if (!parsedId.success) {
    return { message: "This customer could not be identified.", values };
  }

  if (!parsed.success) {
    return {
      message: "Review the highlighted fields.",
      errors: parsed.error.flatten().fieldErrors,
      values,
    };
  }


  const avatar = await readImageUpload(formData, customerAvatarUpload);
  if (avatar.kind === "invalid") {
    return {
      message: "Review the highlighted fields.",
      errors: { avatar: [avatar.error] },
      values,
    };
  }

  const result = await db
    .updateTable("customers")
    .set(updateFields(parsed.data, avatar))
    .where("id", "=", parsedId.data)
    .where("business_id", "=", business.id)
    .executeTakeFirst();

  if (Number(result.numUpdatedRows) === 0) {
    notFound();
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${parsedId.data}`);
  redirect(`/customers/${parsedId.data}`);
}

export async function archiveCustomer(formData: FormData): Promise<void> {
  const business = await requireBusiness();
  const parsedId = customerIdSchema.safeParse(formData.get("id"));

  if (!parsedId.success) {
    notFound();
  }

  const timestamp = nowIso();
  const result = await db
    .updateTable("customers")
    .set({ archived_at: timestamp, updated_at: timestamp })
    .where("id", "=", parsedId.data)
    .where("business_id", "=", business.id)
    .executeTakeFirst();

  if (Number(result.numUpdatedRows) === 0) {
    notFound();
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${parsedId.data}`);
  redirect(`/customers/${parsedId.data}`);
}

export async function restoreCustomer(formData: FormData): Promise<void> {
  const business = await requireBusiness();
  const parsedId = customerIdSchema.safeParse(formData.get("id"));

  if (!parsedId.success) {
    notFound();
  }

  const result = await db
    .updateTable("customers")
    .set({ archived_at: null, updated_at: nowIso() })
    .where("id", "=", parsedId.data)
    .where("business_id", "=", business.id)
    .executeTakeFirst();

  if (Number(result.numUpdatedRows) === 0) {
    notFound();
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${parsedId.data}`);
  redirect(`/customers/${parsedId.data}`);
}
