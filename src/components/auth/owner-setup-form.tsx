"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { ArrowRightIcon, KeyRoundIcon } from "@/components/ui/icons"

import { InlineNotice } from "@/components/auth/inline-notice"
import { SetupField } from "@/components/auth/setup-field"
import { Button } from "@/components/ui/button"

type OwnerSetupFormProps = {
  error?: string
}

const ownerErrors: Record<string, string> = {
  "invalid-owner": "Check the account details and try again.",
  "invalid-token": "That setup token is not valid.",
  "setup-failed": "Folio could not create the owner account. Try again.",
}

export function OwnerSetupForm({ error }: OwnerSetupFormProps) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [feedback, setFeedback] = useState(error)
  const [isPending, setIsPending] = useState(false)
  const errorMessage = feedback ? ownerErrors[feedback] : undefined

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem("folio:owner-setup")
      if (!saved) return
      const values = JSON.parse(saved) as { email?: string; name?: string }
      const nameInput = formRef.current?.elements.namedItem("name")
      const emailInput = formRef.current?.elements.namedItem("email")
      if (nameInput instanceof HTMLInputElement) {
        nameInput.value = values.name ?? ""
      }
      if (emailInput instanceof HTMLInputElement) {
        emailInput.value = values.email ?? ""
      }
    } catch {
      // Setup remains usable when storage is blocked or unavailable.
    }
  }, [])

  useEffect(() => {
    if (!feedback) return

    const fieldName = feedback === "invalid-token" ? "setupToken" : "name"
    const field = formRef.current?.elements.namedItem(fieldName)
    if (field instanceof HTMLInputElement) field.focus()
  }, [feedback])

  function rememberOwner(form: HTMLFormElement) {
    const formData = new FormData(form)
    try {
      window.sessionStorage.setItem(
        "folio:owner-setup",
        JSON.stringify({
          email: String(formData.get("email") ?? ""),
          name: String(formData.get("name") ?? ""),
        }),
      )
    } catch {
      // Never persist the password or setup token as a fallback.
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isPending) {
      return
    }

    const form = event.currentTarget
    if (!form.reportValidity()) return

    setFeedback(undefined)
    setIsPending(true)

    const formData = new FormData(form)
    const body = new URLSearchParams()
    formData.forEach((value, key) => {
      if (typeof value === "string") body.append(key, value)
    })

    try {
      const response = await fetch(form.action, {
        body,
        headers: { accept: "application/json" },
        method: "POST",
      })
      const result = (await response.json().catch(() => null)) as {
        error?: string
        redirectTo?: string
      } | null

      if (!response.ok || !result?.redirectTo) {
        setFeedback(result?.error ?? "setup-failed")
        return
      }

      router.replace(result.redirectTo)
      router.refresh()
    } catch {
      setFeedback("setup-failed")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form
      action="/api/setup/owner"
      aria-busy={isPending}
      className="space-y-5"
      method="post"
      onInput={(event) => {
        const form = event.currentTarget
        if (feedback) setFeedback(undefined)
        queueMicrotask(() => rememberOwner(form))
      }}
      onSubmit={handleSubmit}
      ref={formRef}
    >
      {errorMessage ? <InlineNotice id="setup-error">{errorMessage}</InlineNotice> : null}

      <header>
        <h2 className="text-[15px] font-medium text-foreground">
          Create your owner account
        </h2>
        <p className="mt-1 text-[12px] leading-4 text-muted-foreground">
          Next, add your organisation details. You will stay signed in.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <SetupField
          label="Your name"
          name="name"
          autoComplete="name"
          maxLength={100}
          placeholder="Alex Morgan…"
          required
        />
        <SetupField
          label="Sign-in email"
          name="email"
          type="email"
          autoCapitalize="none"
          autoComplete="username"
          autoCorrect="off"
          spellCheck={false}
          inputMode="email"
          maxLength={254}
          placeholder="you@business.com…"
          hint="Used only to sign in. Add the email shown on invoices in the next step."
          required
        />
        <SetupField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          hint="Use at least 8 characters."
          required
        />
        <SetupField
          label="Confirm password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
        />
      </div>

      <div
        className="-mx-3 rounded-2xl bg-surface-subtle px-3 py-3.5 sm:-mx-4 sm:px-4"
        data-setup-token-panel
      >
        <SetupField
          label="Setup token"
          name="setupToken"
          type="password"
          autoComplete="off"
          maxLength={512}
          hint="Find your setup token in the container logs."
          aria-describedby={
            feedback === "invalid-token"
              ? "setup-error setupToken-hint"
              : "setupToken-hint"
          }
          aria-invalid={feedback === "invalid-token" || undefined}
          required
        />
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="h-10 w-full rounded-xl bg-primary text-[13px] text-primary-foreground hover:bg-primary/80"
      >
        <KeyRoundIcon aria-hidden="true" className="size-3.5" />
        {isPending ? "Creating account…" : "Save and continue"}
        <ArrowRightIcon aria-hidden="true" className="size-3.5" />
      </Button>
    </form>
  )
}
