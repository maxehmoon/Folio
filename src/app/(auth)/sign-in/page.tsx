import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AuthShell } from "@/components/auth/auth-shell"
import { InlineNotice } from "@/components/auth/inline-notice"
import { LoginForm } from "@/components/auth/login-form"
import { getInstallationState } from "@/lib/setup/state"

export const metadata: Metadata = {
  title: "Sign in",
}

type SignInPageProps = {
  searchParams: Promise<{
    accountUpdated?: string | string[]
    created?: string | string[]
    next?: string | string[]
  }>
}

function firstQueryValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value
}

function safeReturnTo(value?: string | string[]) {
  const returnTo = firstQueryValue(value)
  if (!returnTo?.startsWith("/")) return "/"

  try {
    const baseUrl = new URL("https://folio.local")
    const destination = new URL(returnTo, baseUrl)
    if (destination.origin !== baseUrl.origin) return "/"
    return `${destination.pathname}${destination.search}${destination.hash}`
  } catch {
    return "/"
  }
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const [installation, params] = await Promise.all([
    getInstallationState(),
    searchParams,
  ])

  if (installation.status === "needs-owner") redirect("/setup")
  if (installation.status === "needs-business") redirect("/setup")
  if (installation.status === "ready") redirect("/")

  return (
    <AuthShell
      title="Sign in"
      description="Use the owner account for this Folio instance."
    >
      {firstQueryValue(params.created) === "1" ? (
        <InlineNotice tone="success">
          Your owner account is ready. Sign in to finish setting up your business.
        </InlineNotice>
      ) : null}
      {firstQueryValue(params.accountUpdated) === "1" ? (
        <InlineNotice tone="success">
          Your login details were updated. Sign in with your new email and password.
        </InlineNotice>
      ) : null}
      <LoginForm returnTo={safeReturnTo(params.next)} />
    </AuthShell>
  )
}
