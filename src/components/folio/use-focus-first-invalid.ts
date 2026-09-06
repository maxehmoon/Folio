"use client"

import { useEffect, useRef } from "react"

export function useFocusFirstInvalid(validationErrors?: object) {
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!validationErrors) return

    formRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus()
  }, [validationErrors])

  return formRef
}
