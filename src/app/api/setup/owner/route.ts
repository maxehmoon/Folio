import { createHash, timingSafeEqual } from "node:crypto"

import { z } from "zod"

import {
  isSameOrigin,
  setupFormResponse,
} from "@/app/api/setup/_utils"
import {
  readBoundedUrlEncodedBody,
  RequestBodyTooLargeError,
  UnsupportedRequestMediaTypeError,
} from "@/lib/bounded-request-body"
import {
  createOwnerOnce,
  type OwnerBootstrapResult,
} from "@/lib/setup/owner-bootstrap"
import { hasOwner } from "@/lib/setup/owner-claim"
import { requireSetupToken } from "@/lib/setup/runtime-secrets"

export const runtime = "nodejs"

const MAX_OWNER_SETUP_BODY_BYTES = 16 * 1024

const ownerSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
    setupToken: z.string().trim().min(1).max(512),
  })
  .refine((owner) => owner.password === owner.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })

function matchesSetupToken(provided: string, configured: string) {
  const providedDigest = createHash("sha256").update(provided).digest()
  const configuredDigest = createHash("sha256").update(configured).digest()
  return timingSafeEqual(providedDigest, configuredDigest)
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 })
  }

  if (await hasOwner()) {
    return setupFormResponse(request, { destination: "/sign-in" })
  }

  const configuredToken = requireSetupToken()

  let formData: URLSearchParams
  try {
    formData = await readBoundedUrlEncodedBody(
      request,
      MAX_OWNER_SETUP_BODY_BYTES,
    )
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return Response.json({ error: "Request body too large" }, { status: 413 })
    }
    if (error instanceof UnsupportedRequestMediaTypeError) {
      return Response.json(
        { error: "Unsupported request media type" },
        { status: 415 },
      )
    }
    return setupFormResponse(request, {
      destination: "/setup?error=invalid-owner",
      error: "invalid-owner",
    })
  }

  const owner = ownerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    setupToken: formData.get("setupToken"),
  })

  if (!owner.success) {
    return setupFormResponse(request, {
      destination: "/setup?error=invalid-owner",
      error: "invalid-owner",
    })
  }

  if (!matchesSetupToken(owner.data.setupToken, configuredToken)) {
    return setupFormResponse(request, {
      destination: "/setup?error=invalid-token",
      error: "invalid-token",
    })
  }

  let bootstrap: OwnerBootstrapResult
  try {
    bootstrap = await createOwnerOnce(
      {
        name: owner.data.name,
        email: owner.data.email,
        password: owner.data.password,
      },
      request,
    )
  } catch {
    return setupFormResponse(request, {
      destination: "/setup?error=setup-failed",
      error: "setup-failed",
      status: 500,
    })
  }

  if (bootstrap.status === "failed") {
    return setupFormResponse(request, {
      destination: "/setup?error=setup-failed",
      error: "setup-failed",
      status: 500,
    })
  }
  if (bootstrap.status !== "created") {
    return setupFormResponse(request, { destination: "/sign-in" })
  }

  return setupFormResponse(request, {
    destination: "/setup?step=organisation",
    headers: bootstrap.headers,
  })
}
