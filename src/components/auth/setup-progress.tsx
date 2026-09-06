"use client"

import { useEffect, useState } from "react"
import { Check } from "@/components/ui/icons"
import { cn } from "@/lib/utils"

const SETUP_STEP_EVENT = "folio-setup-step-change"

const setupSteps = [
  {
    description: "Owner login and setup token",
    label: "Account",
  },
  {
    description: "Name and contact details",
    label: "Organisation",
  },
  {
    description: "Seller address shown on invoices",
    label: "Address",
  },
  {
    description: "Currency, terms and invoice numbering",
    label: "Defaults",
  },
] as const

type SetupProgressProps = {
  currentStep: number
}

function clampStep(step: number) {
  return Math.min(Math.max(step, 0), setupSteps.length - 1)
}

function stepFromUrl(fallback: number) {
  const step = new URLSearchParams(window.location.search).get("step")

  if (step === "address") return 2
  if (step === "defaults") return 3
  if (step === "organisation") return 1
  return clampStep(fallback)
}

export function notifySetupStep(step: number) {
  window.dispatchEvent(
    new CustomEvent<number>(SETUP_STEP_EVENT, { detail: clampStep(step) }),
  )
}

export function SetupProgress({ currentStep: initialStep }: SetupProgressProps) {
  const [currentStep, setCurrentStep] = useState(clampStep(initialStep))

  useEffect(() => {
    const syncFromUrl = () => setCurrentStep(stepFromUrl(initialStep))
    const syncFromForm = (event: Event) => {
      setCurrentStep(clampStep((event as CustomEvent<number>).detail))
    }

    const requestedStep = stepFromUrl(initialStep)
    queueMicrotask(() => setCurrentStep(requestedStep))

    window.addEventListener("popstate", syncFromUrl)
    window.addEventListener(SETUP_STEP_EVENT, syncFromForm)

    return () => {
      window.removeEventListener("popstate", syncFromUrl)
      window.removeEventListener(SETUP_STEP_EVENT, syncFromForm)
    }
  }, [initialStep])

  return (
    <ol
      aria-label="Setup progress"
      className="mt-8"
    >
      {setupSteps.map((step, index) => {
        const complete = index < currentStep
        const current = index === currentStep
        const finalStep = index === setupSteps.length - 1

        return (
          <li
            aria-current={current ? "step" : undefined}
            className="relative grid grid-cols-[24px_1fr] gap-3 pb-6 last:pb-0"
            key={step.label}
          >
            {!finalStep && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-[11px] top-6 h-[calc(100%-1.5rem)] w-px bg-sidebar-border",
                  complete && "bg-foreground/30",
                )}
              />
            )}

            <span className="relative z-10 grid size-6 place-items-center">
              {complete ? (
                <Check aria-hidden="true" className="size-4 text-foreground" />
              ) : (
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-3 rounded-full border border-foreground/15 bg-sidebar",
                    current && "border-foreground bg-foreground",
                  )}
                />
              )}
            </span>

            <div className="min-w-0 pt-0.5">
              <span
                className={cn(
                  "text-[13px] font-medium text-muted-foreground",
                  (complete || current) && "text-foreground",
                )}
              >
                {step.label}
              </span>
              <p className="mt-1 text-[12px] leading-4 text-muted-foreground">
                {step.description}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
