"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AlertCircleIcon } from "@/components/ui/icons"

const VALIDATION_MESSAGE_ID = "folio-form-validation-message"

type ValidatableControl =
  | HTMLInputElement
  | HTMLSelectElement
  | HTMLTextAreaElement

type ValidationIssue = {
  anchor: HTMLElement
  container: HTMLElement
  label: string
  message: string
  previousAriaDescribedBy: string | null
  previousAriaInvalid: string | null
  target: ValidatableControl
}

function isValidatableControl(target: EventTarget | null): target is ValidatableControl {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  )
}

function fieldLabel(control: ValidatableControl) {
  const ariaLabel = control.getAttribute("aria-label")?.trim()
  if (ariaLabel) return ariaLabel

  const label = control.labels?.[0]?.textContent
    ?.replace(/\s*\(required\)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (label) return label

  return (control.name || control.id || "This field")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/^./, (character) => character.toUpperCase())
}

function validationMessage(control: ValidatableControl, label: string) {
  const validity = control.validity

  if (validity.valueMissing) {
    if (control instanceof HTMLInputElement && control.type === "checkbox") {
      return "Select this option to continue."
    }
    if (control instanceof HTMLInputElement && control.type === "radio") {
      return "Choose an option to continue."
    }
    return `${label} is required.`
  }

  if (validity.typeMismatch) {
    if (control instanceof HTMLInputElement && control.type === "email") {
      return "Enter a valid email address, such as name@example.com."
    }
    if (control instanceof HTMLInputElement && control.type === "url") {
      return "Enter a complete web address."
    }
  }

  if (validity.tooShort && "minLength" in control) {
    return `${label} must be at least ${control.minLength} characters.`
  }

  if (validity.tooLong && "maxLength" in control) {
    return `${label} must be no more than ${control.maxLength} characters.`
  }

  if (control instanceof HTMLInputElement) {
    if (validity.rangeUnderflow) {
      return `${label} must be ${control.min} or more.`
    }
    if (validity.rangeOverflow) {
      return `${label} must be ${control.max} or less.`
    }
    if (validity.badInput) return "Enter a valid number."
    if (validity.stepMismatch) return `Enter a valid ${label.toLowerCase()}.`
  }

  if (validity.patternMismatch) {
    return control.dataset.validationMessage || "Check the format and try again."
  }

  if (validity.customError && control.validationMessage) {
    return control.validationMessage
  }

  return `Check ${label.toLowerCase()} and try again.`
}

function validationAnchor(control: ValidatableControl) {
  if (control.getAttribute("aria-hidden") !== "true") return control

  const sibling = control.nextElementSibling
  if (sibling instanceof HTMLElement && sibling.matches('[role="combobox"]')) {
    return sibling
  }

  const combobox = control.parentElement?.querySelector<HTMLElement>(
    '[role="combobox"]',
  )
  return combobox ?? control
}

function validationContainer(
  control: ValidatableControl,
  anchor: HTMLElement,
) {
  const declaredContainer = anchor.closest<HTMLElement>(
    "[data-validation-container]",
  )
  if (declaredContainer) return declaredContainer

  if (control instanceof HTMLInputElement && control.type === "checkbox") {
    return control.closest("label")?.parentElement ?? control.form ?? document.body
  }

  return anchor.parentElement ?? control.form ?? document.body
}

function firstInvalidControl(form: HTMLFormElement | null) {
  if (!form) return null

  return Array.from(form.elements).find(
    (element): element is ValidatableControl =>
      isValidatableControl(element) &&
      element.willValidate &&
      !element.validity.valid,
  )
}

export function FormValidationProvider() {
  const issueRef = useRef<ValidationIssue | null>(null)
  const [issue, setIssue] = useState<ValidationIssue | null>(null)

  useEffect(() => {
    function restoreAccessibility(currentIssue: ValidationIssue) {
      const { anchor, previousAriaDescribedBy, previousAriaInvalid } = currentIssue

      if (previousAriaInvalid === null) anchor.removeAttribute("aria-invalid")
      else anchor.setAttribute("aria-invalid", previousAriaInvalid)

      if (previousAriaDescribedBy === null) {
        anchor.removeAttribute("aria-describedby")
      } else {
        anchor.setAttribute("aria-describedby", previousAriaDescribedBy)
      }
    }

    function clearIssue() {
      const currentIssue = issueRef.current
      if (!currentIssue) return
      restoreAccessibility(currentIssue)
      issueRef.current = null
      setIssue(null)
    }

    function showIssue(target: ValidatableControl) {
      const currentIssue = issueRef.current
      const anchor = validationAnchor(target)
      const container = validationContainer(target, anchor)
      const label = fieldLabel(target)

      if (currentIssue && currentIssue.target !== target) {
        restoreAccessibility(currentIssue)
      }

      const nextIssue: ValidationIssue = {
        anchor,
        container,
        label,
        message: validationMessage(target, label),
        previousAriaDescribedBy:
          currentIssue?.target === target
            ? currentIssue.previousAriaDescribedBy
            : anchor.getAttribute("aria-describedby"),
        previousAriaInvalid:
          currentIssue?.target === target
            ? currentIssue.previousAriaInvalid
            : anchor.getAttribute("aria-invalid"),
        target,
      }

      const describedBy = new Set(
        (nextIssue.previousAriaDescribedBy ?? "").split(/\s+/).filter(Boolean),
      )
      describedBy.add(VALIDATION_MESSAGE_ID)
      anchor.setAttribute("aria-describedby", Array.from(describedBy).join(" "))
      anchor.setAttribute("aria-invalid", "true")

      issueRef.current = nextIssue
      setIssue(nextIssue)
      requestAnimationFrame(() => {
        anchor.scrollIntoView({ behavior: "smooth", block: "nearest" })
        anchor.focus({ preventScroll: true })
      })
    }

    function handleInvalid(event: Event) {
      if (!isValidatableControl(event.target)) return
      event.preventDefault()

      const firstInvalid = firstInvalidControl(event.target.form)
      if (firstInvalid && firstInvalid !== event.target) return
      showIssue(event.target)
    }

    function clearWhenValid() {
      requestAnimationFrame(() => {
        const currentIssue = issueRef.current
        if (currentIssue?.target.validity.valid) clearIssue()
      })
    }

    function handleInput(event: Event) {
      const currentIssue = issueRef.current
      if (!currentIssue || !isValidatableControl(event.target)) return
      if (event.target !== currentIssue.target) return

      if (event.target.validity.valid) clearIssue()
      else showIssue(event.target)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") clearIssue()
    }

    document.addEventListener("invalid", handleInvalid, true)
    document.addEventListener("input", handleInput, true)
    document.addEventListener("change", clearWhenValid, true)
    document.addEventListener("click", clearWhenValid)
    document.addEventListener("reset", clearIssue, true)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      const currentIssue = issueRef.current
      if (currentIssue) restoreAccessibility(currentIssue)
      document.removeEventListener("invalid", handleInvalid, true)
      document.removeEventListener("input", handleInput, true)
      document.removeEventListener("change", clearWhenValid, true)
      document.removeEventListener("click", clearWhenValid)
      document.removeEventListener("reset", clearIssue, true)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  if (!issue) return null

  return createPortal(
    <div
      aria-live="assertive"
      className="mt-1.5 flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-danger-background px-3 py-2.5 text-card-foreground"
      id={VALIDATION_MESSAGE_ID}
      role="alert"
    >
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-danger-background text-destructive">
        <AlertCircleIcon aria-hidden="true" className="size-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold leading-4">
          Check {issue.label.toLowerCase()}
        </span>
        <span className="mt-0.5 block text-[12px] leading-4 text-muted-foreground">
          {issue.message}
        </span>
      </span>
    </div>,
    issue.container,
  )
}
