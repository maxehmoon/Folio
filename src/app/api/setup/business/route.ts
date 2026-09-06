import {
  isSameOrigin,
  setupFormResponse,
} from "@/app/api/setup/_utils"
import { readBusinessIcon } from "@/features/business/icon.server"
import {
  businessProfileFormValues,
  setupBusinessProfileSchema,
  toBusinessProfileUpdate,
} from "@/features/business/profile"
import { ensureBusinessForUser } from "@/lib/db/businesses"
import { getInstallationState } from "@/lib/setup/state"

export const runtime = "nodejs"

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 })
  }

  const installation = await getInstallationState()
  if (installation.status === "needs-owner") {
    return setupFormResponse(request, { destination: "/setup" })
  }
  if (installation.status === "signed-out") {
    return setupFormResponse(request, {
      destination: "/sign-in?next=%2Fsetup%3Fstep%3Ddefaults",
    })
  }
  if (installation.status === "ready") {
    return setupFormResponse(request, { destination: "/" })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return setupFormResponse(request, {
      destination: "/setup?error=invalid-business&step=defaults",
      error: "invalid-business",
    })
  }

  const business = setupBusinessProfileSchema.safeParse(
    businessProfileFormValues(formData),
  )

  if (!business.success) {
    return setupFormResponse(request, {
      destination: "/setup?error=invalid-business&step=defaults",
      error: "invalid-business",
    })
  }

  const icon = await readBusinessIcon(formData)
  if (icon.status === "error") {
    return setupFormResponse(request, {
      destination: "/setup?error=invalid-icon&step=defaults",
      error: "invalid-icon",
    })
  }

  try {
    await ensureBusinessForUser({
      userId: installation.session.user.id,
      name: business.data.name,
      email: business.data.email,
      currency: business.data.currency,
      timezone: business.data.timezone,
      profile: {
        ...toBusinessProfileUpdate(business.data),
        logo_url: icon.status === "replace" ? icon.dataUrl : null,
      },
    })
  } catch {
    return setupFormResponse(request, {
      destination: "/setup?error=setup-failed&step=defaults",
      error: "setup-failed",
      status: 500,
    })
  }

  return setupFormResponse(request, { destination: "/" })
}
