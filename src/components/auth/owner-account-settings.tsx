import { InlineNotice } from "@/components/auth/inline-notice";
import { LogoutButton } from "@/components/auth/logout-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type OwnerAccountSettingsProps = {
  email: string;
  error?: string;
  name: string;
  saved?: string;
};

const successMessages: Record<string, string> = {
  email: "Login email updated.",
  name: "Display name updated.",
  password: "Password updated. Other sessions have been signed out.",
};

const errorMessages: Record<string, string> = {
  "current-password": "The current password is not correct.",
  email: "Folio could not update the login email. Try again.",
  "invalid-email": "Enter a valid email and your current password.",
  "invalid-name": "Enter a display name of up to 100 characters.",
  "invalid-password":
    "Use 8–128 characters and make sure the new passwords match.",
  name: "Folio could not update the display name. Try again.",
  password: "Folio could not update the password. Try again.",
};

function AccountField({
  autoComplete,
  defaultValue,
  id,
  label,
  maxLength,
  minLength,
  name,
  required = false,
  type = "text",
}: {
  autoComplete: string;
  defaultValue?: string;
  id?: string;
  label: string;
  maxLength: number;
  minLength?: number;
  name: string;
  required?: boolean;
  type?: "email" | "password" | "text";
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id ?? `owner-${name}`}>{label}</Label>
      <Input
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        id={id ?? `owner-${name}`}
        maxLength={maxLength}
        minLength={minLength}
        name={name}
        required={required}
        type={type}
      />
    </div>
  );
}

export function OwnerAccountSettings({
  email,
  error,
  name,
  saved,
}: OwnerAccountSettingsProps) {
  const successMessage = saved ? successMessages[saved] : undefined;
  const errorMessage = error ? errorMessages[error] : undefined;

  return (
    <Card className="scroll-mt-24 rounded-[16px] shadow-none" id="account">
      <CardHeader>
        <CardTitle className="text-[14px]">Owner account</CardTitle>
        <p className="text-[12px] leading-5 text-muted-foreground">
          Change the owner name, login email or password.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {successMessage ? (
          <InlineNotice tone="success">{successMessage}</InlineNotice>
        ) : null}
        {errorMessage ? <InlineNotice>{errorMessage}</InlineNotice> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <AccountField
            autoComplete="name"
            defaultValue={name}
            label="Display name"
            maxLength={100}
            name="ownerName"
            required
          />
          <AccountField
            autoComplete="email"
            defaultValue={email}
            label="Login email"
            maxLength={254}
            name="ownerEmail"
            required
            type="email"
          />
        </div>

        <div className="rounded-2xl bg-surface-subtle p-4">
          <div className="mb-4">
            <p className="text-[13px] font-medium text-foreground">
              Sign-in security
            </p>
            <p className="mt-1 text-[12px] leading-4 text-muted-foreground">
              Enter the current password when changing the login email or
              password. Other sessions are signed out after a password change.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
          <AccountField
            autoComplete="current-password"
            id="owner-current-password"
            label="Current password"
            maxLength={128}
            name="ownerCurrentPassword"
            type="password"
          />
          <AccountField
            autoComplete="new-password"
            label="New password"
            maxLength={128}
            minLength={8}
            name="ownerNewPassword"
            type="password"
          />
          <AccountField
            autoComplete="new-password"
            label="Confirm new password"
            maxLength={128}
            minLength={8}
            name="ownerConfirmPassword"
            type="password"
          />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 pt-1">
          <p className="text-[12px] text-muted-foreground">
            Signed in as {email}
          </p>
          <LogoutButton className="rounded-full" variant="outline" />
        </div>
      </CardContent>
    </Card>
  );
}
