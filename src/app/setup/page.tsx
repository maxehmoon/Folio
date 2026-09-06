import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { BusinessSetupForm } from "@/components/auth/business-setup-form"
import { OnboardingShell } from "@/components/auth/onboarding-shell"
import { OwnerSetupForm } from "@/components/auth/owner-setup-form"
import { readSetupDefaults } from "@/lib/setup/defaults"
import { getInstallationState } from "@/lib/setup/state"

export const metadata: Metadata = {
  title: "Set up Folio",
  robots: { index: false, follow: false },
}

type SetupPageProps = {
  searchParams: Promise<{
    error?: string | string[]
    step?: string | string[]
  }>
}

function businessSetupStep(step: string | string[] | undefined) {
  const value = Array.isArray(step) ? step[0] : step
  if (value === "address") return 2
  if (value === "defaults") return 3
  return 1
}

export default async function SetupPage({ searchParams }: SetupPageProps) {
  const [installation, params] = await Promise.all([
    getInstallationState(),
    searchParams,
  ])
  const error = Array.isArray(params.error) ? params.error[0] : params.error

  if (installation.status === "needs-owner") {
    return (
      <OnboardingShell
        currentStep={0}
        description="Create the owner account, then add the organisation details used on invoices."
        title="Set up your workspace"
      >
        <OwnerSetupForm error={error} />
      </OnboardingShell>
    )
  }

  if (installation.status === "signed-out") {
    redirect("/sign-in?next=%2Fsetup")
  }
  if (installation.status === "ready") redirect("/")

  return (
    <OnboardingShell
      currentStep={businessSetupStep(params.step)}
      description="Create the owner account, then add the organisation details used on invoices."
      title="Set up your workspace"
    >
      <BusinessSetupForm
        configuredDefaults={readSetupDefaults()}
        error={error}
        ownerEmail={installation.session.user.email}
        ownerId={installation.session.user.id}
      />
    </OnboardingShell>
  )
}
