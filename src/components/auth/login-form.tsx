"use client"

import { useState, type FormEvent } from "react"
import { EyeIcon, EyeOffIcon, LoaderCircleIcon } from "@/components/ui/icons"
import { useRouter } from "next/navigation"

import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { InlineNotice } from "@/components/auth/inline-notice"

type LoginFormProps = {
  returnTo?: string
}

function readableSignInError(code?: string) {
  switch (code) {
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_PASSWORD":
    case "USER_NOT_FOUND":
      return "The email or password is incorrect."
    case "EMAIL_NOT_VERIFIED":
      return "Verify your email address before signing in."
    case "INVALID_ORIGIN":
      return "This address is not configured for Folio. Open the URL shown in the container logs."
    case "TOO_MANY_REQUESTS":
      return "Too many sign-in attempts. Wait a moment and try again."
    default:
      return "Folio could not sign you in. Check the app address and try again."
  }
}

export function LoginForm({ returnTo = "/" }: LoginFormProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsPending(true)

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get("email") ?? "").trim()
    const password = String(formData.get("password") ?? "")

    try {
      const result = await authClient.signIn.email({ email, password, rememberMe })

      if (result.error) {
        setError(readableSignInError(result.error.code))
        return
      }

      router.replace(returnTo)
      router.refresh()
    } catch {
      setError("Folio could not sign you in. Check your connection and try again.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form
      method="post"
      className="space-y-4"
      onSubmit={handleSubmit}
      aria-busy={isPending}
    >
      {error ? <InlineNotice id="sign-in-error">{error}</InlineNotice> : null}

      <div className="space-y-1.5" data-validation-container>
        <Label htmlFor="email" className="text-[13px] text-foreground">
          Email address
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoCapitalize="none"
          autoComplete="username"
          autoCorrect="off"
          spellCheck={false}
          inputMode="email"
          required
          aria-describedby={error ? "sign-in-error" : undefined}
          aria-invalid={error ? true : undefined}
          className="h-10 rounded-[10px] border-foreground/[0.06] bg-field px-3 text-[14px] tracking-[-0.15px] placeholder:text-subtle-foreground"
          placeholder="you@business.com…"
        />
      </div>

      <div className="space-y-1.5" data-validation-container>
        <Label htmlFor="password" className="text-[13px] text-foreground">
          Password
        </Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            aria-describedby={error ? "sign-in-error" : undefined}
            aria-invalid={error ? true : undefined}
            className="h-10 rounded-[10px] border-foreground/[0.06] bg-field px-3 pr-10 text-[14px] tracking-[-0.15px] placeholder:text-subtle-foreground"
            placeholder="Enter your password…"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full text-subtle-foreground hover:bg-foreground/[0.05] hover:text-foreground"
            onClick={() => setShowPassword((visible) => !visible)}
          >
            {showPassword ? (
              <EyeOffIcon aria-hidden="true" className="size-3.5" />
            ) : (
              <EyeIcon aria-hidden="true" className="size-3.5" />
            )}
          </Button>
        </div>
      </div>

      <Label
        htmlFor="remember-me"
        className="flex cursor-pointer items-center gap-2 pt-0.5 text-[12px] font-normal text-muted-foreground"
      >
        <Checkbox
          id="remember-me"
          checked={rememberMe}
          onCheckedChange={(checked) => setRememberMe(checked === true)}
        />
        <span>Keep me signed in on this device</span>
      </Label>

      <Button
        type="submit"
        disabled={isPending}
        className="mt-1 h-10 w-full rounded-full bg-primary text-[13px] text-primary-foreground hover:bg-primary/80"
      >
        {isPending ? (
          <>
            <LoaderCircleIcon aria-hidden="true" className="size-3.5 animate-spin" />
            Signing in…
          </>
        ) : (
          "Sign in"
        )}
      </Button>
    </form>
  )
}
