"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";
import { requireSession } from "@/lib/session";

import {
  ownerEmailSchema,
  ownerNameSchema,
  ownerPasswordSchema,
} from "./schema";

function settingsAccountUrl(parameter: string): string {
  return `/settings?${parameter}#account`;
}

function invalidPassword(error: unknown): boolean {
  return error instanceof Error && /password/i.test(error.message);
}

export async function updateOwnerName(formData: FormData): Promise<never> {
  const result = ownerNameSchema.safeParse({ name: formData.get("name") });
  if (!result.success) redirect(settingsAccountUrl("accountError=invalid-name"));

  await requireSession();
  try {
    const requestHeaders = await headers();
    await getAuth(requestHeaders).api.updateUser({
      body: { name: result.data.name },
      headers: requestHeaders,
    });
  } catch {
    redirect(settingsAccountUrl("accountError=name"));
  }

  revalidatePath("/", "layout");
  redirect(settingsAccountUrl("accountSaved=name"));
}

export async function updateOwnerEmail(formData: FormData): Promise<never> {
  const result = ownerEmailSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    email: formData.get("email"),
  });
  if (!result.success) redirect(settingsAccountUrl("accountError=invalid-email"));

  const session = await requireSession();
  if (result.data.email === session.user.email.toLowerCase()) {
    redirect(settingsAccountUrl("accountSaved=email"));
  }

  const requestHeaders = await headers();
  const auth = getAuth(requestHeaders);
  try {
    await auth.api.verifyPassword({
      body: { password: result.data.currentPassword },
      headers: requestHeaders,
    });
  } catch (error) {
    redirect(
      settingsAccountUrl(
        invalidPassword(error)
          ? "accountError=current-password"
          : "accountError=email",
      ),
    );
  }

  try {
    await auth.api.changeEmail({
      body: { newEmail: result.data.email },
      headers: requestHeaders,
    });
  } catch {
    redirect(settingsAccountUrl("accountError=email"));
  }

  revalidatePath("/", "layout");
  redirect(settingsAccountUrl("accountSaved=email"));
}

export async function updateOwnerPassword(formData: FormData): Promise<never> {
  const result = ownerPasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!result.success) {
    redirect(settingsAccountUrl("accountError=invalid-password"));
  }

  await requireSession();
  try {
    const requestHeaders = await headers();
    await getAuth(requestHeaders).api.changePassword({
      body: {
        currentPassword: result.data.currentPassword,
        newPassword: result.data.newPassword,
        revokeOtherSessions: true,
      },
      headers: requestHeaders,
    });
  } catch (error) {
    redirect(
      settingsAccountUrl(
        invalidPassword(error)
          ? "accountError=current-password"
          : "accountError=password",
      ),
    );
  }

  redirect(settingsAccountUrl("accountSaved=password"));
}
