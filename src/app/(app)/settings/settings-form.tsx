"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { InlineNotice } from "@/components/auth/inline-notice";
import { LoaderCircleIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { SEARCHABLE_SELECT_SET_VALUE_EVENT } from "@/components/ui/searchable-select";

import type { SettingsFormState } from "./actions";

type SettingsFormAction = (
  state: SettingsFormState,
  formData: FormData,
) => Promise<SettingsFormState>;

export function SettingsForm({
  action,
  children,
}: {
  action: SettingsFormAction;
  children: ReactNode;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const submittedValuesRef = useRef<Map<string, string>>(new Map());
  const [state, formAction, isPending] = useActionState(action, {});

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    if (state.status === "error") {
      requestAnimationFrame(() => {
        for (const [name, value] of submittedValuesRef.current) {
          const control = form.elements.namedItem(name);
          if (
            control instanceof HTMLInputElement &&
            control.type !== "file"
          ) {
            if (control.type === "checkbox" || control.type === "radio") {
              control.checked = control.value === value;
            } else if (control.getAttribute("aria-hidden") === "true") {
              control.dispatchEvent(
                new CustomEvent(SEARCHABLE_SELECT_SET_VALUE_EVENT, {
                  detail: value,
                }),
              );
            } else {
              control.value = value;
            }
          } else if (
            control instanceof HTMLTextAreaElement ||
            control instanceof HTMLSelectElement
          ) {
            control.value = value;
          }
        }

        const field = state.field
          ? form.elements.namedItem(state.field)
          : null;
        if (field instanceof HTMLElement) {
          field.focus();
          field.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
      return;
    }

    if (state.status === "success") {
      for (const name of [
        "ownerCurrentPassword",
        "ownerNewPassword",
        "ownerConfirmPassword",
      ]) {
        const field = form.elements.namedItem(name);
        if (field instanceof HTMLInputElement) field.value = "";
      }
      router.refresh();
    }
  }, [router, state]);

  return (
    <form
      action={formAction}
      aria-busy={isPending}
      className="space-y-4"
      onSubmit={(event) => {
        const submittedValues = new Map<string, string>();
        new FormData(event.currentTarget).forEach((value, name) => {
          if (typeof value === "string") submittedValues.set(name, value);
        });
        submittedValuesRef.current = submittedValues;
      }}
      ref={formRef}
    >
      {state.message ? (
        <InlineNotice
          id="settings-form-message"
          tone={state.status === "success" ? "success" : "error"}
        >
          {state.message}
        </InlineNotice>
      ) : null}

      {children}

      <div className="flex justify-end">
        <Button className="rounded-full" disabled={isPending} type="submit">
          {isPending ? (
            <LoaderCircleIcon
              aria-hidden="true"
              className="size-3.5 animate-spin motion-reduce:animate-none"
            />
          ) : null}
          {isPending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
