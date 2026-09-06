"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Logout01Icon } from "@/components/ui/logout-01"
import type { AnimatedIconHandle } from "@/lib/use-icon-animation"

type LogoutButtonProps = Omit<React.ComponentProps<typeof Button>, "onClick">

export function LogoutButton({ children = "Sign out", disabled, ...props }: LogoutButtonProps) {
  const router = useRouter()
  const iconRef = useRef<AnimatedIconHandle>(null)
  const [isPending, setIsPending] = useState(false)
  const [failed, setFailed] = useState(false)

  async function signOut() {
    setFailed(false)
    setIsPending(true)

    try {
      const result = await authClient.signOut()
      if (result.error) {
        setFailed(true)
        return
      }
      router.replace("/sign-in")
      router.refresh()
    } catch {
      setFailed(true)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Button
      data-haptic="warning"
      type="button"
      disabled={disabled || isPending}
      onClick={signOut}
      {...props}
      onBlur={() => iconRef.current?.stopAnimation()}
      onFocus={() => iconRef.current?.startAnimation()}
      onPointerDown={() => iconRef.current?.startAnimation()}
      onPointerEnter={() => iconRef.current?.startAnimation()}
      onPointerLeave={() => iconRef.current?.stopAnimation()}
    >
      <Logout01Icon ref={iconRef} aria-hidden="true" className="size-3.5 [&_svg]:size-full" size={14} />
      {isPending ? "Signing out…" : failed ? "Try signing out again" : children}
    </Button>
  )
}
