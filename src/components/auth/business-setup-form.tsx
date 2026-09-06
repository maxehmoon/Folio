"use client"

import { type FormEvent, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRightIcon, Building2Icon, ChevronLeftIcon } from "@/components/ui/icons"

import { AddressStep } from "@/components/auth/business-setup/address-step"
import { DefaultsStep } from "@/components/auth/business-setup/defaults-step"
import type { BusinessSetupDraft } from "@/components/auth/business-setup/draft"
import { IdentityStep } from "@/components/auth/business-setup/identity-step"
import { InlineNotice } from "@/components/auth/inline-notice"
import { notifySetupStep } from "@/components/auth/setup-progress"
import { Button } from "@/components/ui/button"
import { COUNTRY_CODES } from "@/lib/countries"
import type { SetupDefaults } from "@/lib/setup/defaults"
import { SUPPORTED_TIMEZONE_IDS } from "@/lib/timezones"

type BusinessSetupFormProps = {
  configuredDefaults: SetupDefaults
  error?: string
  ownerEmail: string
  ownerId: string
}

const businessErrors: Record<string, string> = {
  "invalid-business":
    "Check the organisation details below and try again. Your draft has been kept on this device.",
  "invalid-icon":
    "Choose a PNG, JPEG or WebP icon under 512 KB. Your other details are still here.",
  "setup-failed":
    "Folio could not save the organisation profile. Your draft is safe; try again.",
}

const setupStepSlugs = ["organisation", "address", "defaults"] as const
const draftFields = [
  "name",
  "legalName",
  "email",
  "phone",
  "taxId",
  "addressLine1",
  "addressLine2",
  "city",
  "region",
  "postalCode",
  "countryCode",
  "currency",
  "paymentTermsDays",
  "invoicePrefix",
  "timezone",
  "paymentInstructions",
  "invoiceFooter",
] as const satisfies ReadonlyArray<keyof BusinessSetupDraft>

type StoredBusinessSetupDraft = {
  step: number
  values: BusinessSetupDraft
}

function stepFromUrl() {
  const slug = new URL(window.location.href).searchParams.get("step")
  const index = setupStepSlugs.findIndex((candidate) => candidate === slug)
  return index >= 0 ? index : null
}

function browserSetupDefaults(): BusinessSetupDraft {
  const defaults: BusinessSetupDraft = {}

  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (SUPPORTED_TIMEZONE_IDS.has(timezone)) defaults.timezone = timezone

    const region = new Intl.Locale(window.navigator.language).region?.toUpperCase()
    if (region && COUNTRY_CODES.has(region)) defaults.countryCode = region
  } catch {
    // The fields remain selectable when browser locale detection is unavailable.
  }

  return defaults
}

export function BusinessSetupForm({
  configuredDefaults,
  error,
  ownerEmail,
  ownerId,
}: BusinessSetupFormProps) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<BusinessSetupDraft>({})
  const [feedback, setFeedback] = useState(error)
  const [isHydrated, setIsHydrated] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const errorMessage = feedback ? businessErrors[feedback] : undefined
  const draftStorageKey = `folio:business-setup:${ownerId}`

  useEffect(() => {
    let cancelled = false
    let stored: StoredBusinessSetupDraft | null = null
    try {
      const value = window.sessionStorage.getItem(draftStorageKey)
      stored = value ? (JSON.parse(value) as StoredBusinessSetupDraft) : null
    } catch {
      stored = null
    }

    const requestedStep = stepFromUrl()
    const restoredStep = requestedStep ?? stored?.step ?? 0
    const safeStep = Math.min(
      Math.max(restoredStep, 0),
      setupStepSlugs.length - 1,
    )

    queueMicrotask(() => {
      if (cancelled) return
      setDraft({
        ...browserSetupDefaults(),
        ...configuredDefaults,
        ...stored?.values,
      })
      setStep(safeStep)
      setIsHydrated(true)
      notifySetupStep(safeStep + 1)
    })

    const url = new URL(window.location.href)
    if (url.searchParams.get("step") !== setupStepSlugs[safeStep]) {
      url.searchParams.set("step", setupStepSlugs[safeStep])
      window.history.replaceState(null, "", url)
    }

    return () => {
      cancelled = true
    }
  }, [configuredDefaults, draftStorageKey])

  useEffect(() => {
    function restoreStepFromHistory() {
      const restoredStep = stepFromUrl()
      if (restoredStep !== null) {
        setStep(restoredStep)
        notifySetupStep(restoredStep + 1)
      }
    }

    window.addEventListener("popstate", restoreStepFromHistory)
    return () => window.removeEventListener("popstate", restoreStepFromHistory)
  }, [])

  function saveDraft(form = formRef.current, currentStep = step) {
    if (!form || !isHydrated) return

    const formData = new FormData(form)
    const values: BusinessSetupDraft = {}
    for (const field of draftFields) {
      const value = formData.get(field)
      if (typeof value === "string") values[field] = value
    }

    try {
      window.sessionStorage.setItem(
        draftStorageKey,
        JSON.stringify({ step: currentStep, values }),
      )
    } catch {
      // Setup remains usable when storage is blocked or unavailable.
    }
  }

  function moveToStep(nextStep: number) {
    const safeStep = Math.min(
      Math.max(nextStep, 0),
      setupStepSlugs.length - 1,
    )
    saveDraft(formRef.current, safeStep)
    setStep(safeStep)

    const url = new URL(window.location.href)
    url.searchParams.delete("error")
    url.searchParams.set("step", setupStepSlugs[safeStep])
    window.history.pushState(null, "", url)
    notifySetupStep(safeStep + 1)
  }

  function advance() {
    const activePanel = formRef.current?.querySelector<HTMLElement>(
      `[data-setup-step="${step}"]`,
    )
    const controls = activePanel?.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >("input:not([type='hidden']), textarea, select")

    for (const control of controls ?? []) {
      if (!control.checkValidity()) {
        control.reportValidity()
        return
      }
    }

    moveToStep(step + 1)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (step < setupStepSlugs.length - 1) {
      advance()
      return
    }

    if (isPending) {
      return
    }

    const form = event.currentTarget
    saveDraft(form)
    setFeedback(undefined)
    setIsPending(true)

    try {
      const response = await fetch(form.action, {
        body: new FormData(form),
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

      try {
        window.sessionStorage.removeItem(draftStorageKey)
      } catch {
        // Setup can still finish when storage is blocked or unavailable.
      }
      router.replace(result.redirectTo)
      router.refresh()
    } catch {
      setFeedback("setup-failed")
    } finally {
      setIsPending(false)
    }
  }

  if (!isHydrated) {
    return (
      <div className="space-y-6" aria-live="polite">
        <div className="min-h-48 animate-pulse rounded-2xl bg-surface-subtle" />
      </div>
    )
  }

  return (
    <form
      action="/api/setup/business"
      aria-busy={isPending}
      className="space-y-6"
      encType="multipart/form-data"
      method="post"
      onInput={(event) => {
        if (feedback) setFeedback(undefined)
        saveDraft(event.currentTarget)
      }}
      onSubmit={handleSubmit}
      ref={formRef}
    >
      <input name="setupStep" type="hidden" value={setupStepSlugs[step]} />

      {errorMessage ? (
        <InlineNotice id="setup-error">{errorMessage}</InlineNotice>
      ) : null}

      <IdentityStep active={step === 0} draft={draft} ownerEmail={ownerEmail} />
      <AddressStep
        active={step === 1}
        draft={draft}
      />
      <DefaultsStep
        active={step === 2}
        draft={draft}
      />

      <div className="flex items-center justify-between gap-3 pt-1">
        {step > 0 ? (
          <Button
            className="h-10 rounded-xl px-4 text-[13px]"
            disabled={isPending}
            onClick={() => moveToStep(step - 1)}
            type="button"
            variant="ghost"
          >
            <ChevronLeftIcon aria-hidden="true" className="size-3.5" />
            Back
          </Button>
        ) : (
          <span />
        )}

        {step < setupStepSlugs.length - 1 ? (
          <Button
            key="continue"
            className="h-10 rounded-xl px-5 text-[13px]"
            onClick={(event) => {
              // React can reuse this DOM button when the step changes. Prevent
              // the click's native default explicitly so it cannot become the
              // newly-rendered submit action in the same event.
              event.preventDefault()
              advance()
            }}
            type="button"
          >
            Continue
            <ArrowRightIcon aria-hidden="true" className="size-3.5" />
          </Button>
        ) : (
          <Button
            key="finish"
            className="h-10 rounded-xl px-5 text-[13px]"
            disabled={isPending}
            onClick={() => formRef.current?.requestSubmit()}
            type="button"
          >
            <Building2Icon aria-hidden="true" className="size-3.5" />
            {isPending ? "Finishing setup…" : "Finish setup"}
            <ArrowRightIcon aria-hidden="true" className="size-3.5" />
          </Button>
        )}
      </div>
    </form>
  )
}
