"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  ownerEmailSchema,
  ownerNameSchema,
  ownerPasswordSchema,
} from "@/features/account/schema";
import { readBusinessIcon } from "@/features/business/icon.server";
import {
  businessProfileFormValues,
  settingsBusinessProfileSchema,
  toBusinessProfileUpdate,
} from "@/features/business/profile";
import { updateBusinessForOwner } from "@/lib/db/businesses";
import { getAuth } from "@/lib/auth";
import { requireSession } from "@/lib/session";

export type SettingsFormState = {
  field?: string;
  message?: string;
  status?: "error" | "success";
};

function formError(message: string, field?: string): SettingsFormState {
  return { field, message, status: "error" };
}

function invalidPassword(error: unknown): boolean {
  return error instanceof Error && /password/i.test(error.message);
}

export async function updateSettings(
  _previousState: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const session = await requireSession();
  const icon = await readBusinessIcon(formData);
  if (icon.status === "error") {
    return formError("Choose a PNG, JPEG or WebP icon under 512 KB.", "icon");
  }

  const result = settingsBusinessProfileSchema.safeParse(
    businessProfileFormValues(formData),
  );

  if (!result.success) {
    return formError("Check the business details and try again.", "name");
  }

  const ownerNameResult = ownerNameSchema.safeParse({
    name: formData.get("ownerName"),
  });
  if (!ownerNameResult.success) {
    return formError(
      "Enter a display name of up to 100 characters.",
      "ownerName",
    );
  }

  const ownerEmail = String(formData.get("ownerEmail") ?? "")
    .trim()
    .toLowerCase();
  const currentPassword = String(
    formData.get("ownerCurrentPassword") ?? "",
  );
  const newPassword = String(formData.get("ownerNewPassword") ?? "");
  const confirmPassword = String(
    formData.get("ownerConfirmPassword") ?? "",
  );
  const emailChanged = ownerEmail !== session.user.email.toLowerCase();
  const passwordChanged = Boolean(newPassword || confirmPassword);

  const ownerEmailResult = emailChanged
    ? ownerEmailSchema.safeParse({ email: ownerEmail, currentPassword })
    : null;
  if (ownerEmailResult && !ownerEmailResult.success) {
    return formError(
      "Enter a valid login email and your current password.",
      "ownerEmail",
    );
  }

  const ownerPasswordResult = passwordChanged
    ? ownerPasswordSchema.safeParse({
        confirmPassword,
        currentPassword,
        newPassword,
      })
    : null;
  if (ownerPasswordResult && !ownerPasswordResult.success) {
    return formError(
      "Use 8–128 characters and make sure the new passwords match.",
      "ownerNewPassword",
    );
  }

  const requestHeaders = await headers();
  const auth = getAuth(requestHeaders);
  if (emailChanged || passwordChanged) {
    try {
      await auth.api.verifyPassword({
        body: { password: currentPassword },
        headers: requestHeaders,
      });
    } catch (error) {
      return formError(
        invalidPassword(error)
          ? "The current password is not correct."
          : "Folio could not verify the account credentials. Try again.",
        "ownerCurrentPassword",
      );
    }
  }

  const profileUpdate = toBusinessProfileUpdate(result.data);
  if (icon.status === "replace") profileUpdate.logo_url = icon.dataUrl;
  if (icon.status === "remove") profileUpdate.logo_url = null;

  const updated = await updateBusinessForOwner(
    session.user.id,
    profileUpdate,
  );

  if (!updated) {
    return formError("Folio could not save these settings. Try again.");
  }

  if (ownerNameResult.data.name !== session.user.name) {
    try {
      await auth.api.updateUser({
        body: { name: ownerNameResult.data.name },
        headers: requestHeaders,
      });
    } catch {
      return formError(
        "The business settings were saved, but Folio could not update the display name.",
        "ownerName",
      );
    }
  }

  if (ownerEmailResult?.success) {
    try {
      await auth.api.changeEmail({
        body: { newEmail: ownerEmailResult.data.email },
        headers: requestHeaders,
      });
    } catch {
      return formError(
        "The other settings were saved, but Folio could not update the login email.",
        "ownerEmail",
      );
    }
  }

  if (ownerPasswordResult?.success) {
    try {
      await auth.api.changePassword({
        body: {
          currentPassword: ownerPasswordResult.data.currentPassword,
          newPassword: ownerPasswordResult.data.newPassword,
          revokeOtherSessions: true,
        },
        headers: requestHeaders,
      });
    } catch (error) {
      return formError(
        invalidPassword(error)
          ? "The current password is not correct."
          : "The other settings were saved, but Folio could not update the password.",
        invalidPassword(error)
          ? "ownerCurrentPassword"
          : "ownerNewPassword",
      );
    }
  }

  revalidatePath("/", "layout");
  return {
    message: emailChanged
      ? "Settings saved. Use the new email the next time you sign in."
      : "Settings saved.",
    status: "success",
  };
}
