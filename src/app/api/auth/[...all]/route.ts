import {
  isEmailSignInRequest,
  isPublicOwnerRegistration,
} from "@/app/api/auth/_utils";
import {
  acquireEmailSignInWork,
  MAX_AUTH_BODY_BYTES,
  readEmailSignInIdentity,
  reserveEmailSignInAttempt,
  tryAdmitEmailSignIn,
} from "@/lib/auth-rate-limit";
import { getAuth, useEmailSignInCapacityGuard } from "@/lib/auth";
import {
  readBoundedRequestBody,
  RequestBodyTooLargeError,
} from "@/lib/bounded-request-body";
import { db } from "@/lib/db";
import { debugLog } from "@/lib/logger";
import { requestWithPublicOrigin } from "@/lib/runtime-config";

export const runtime = "nodejs";

async function handleAuth(request: Request): Promise<Response> {
  const startedAt = performance.now();
  try {
    const response = await getAuth(request).handler(requestWithPublicOrigin(request));
    debugLog("auth.request.completed", {
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return response;
  } catch (error) {
    debugLog("auth.request.failed", {
      durationMs: Math.round(performance.now() - startedAt),
    });
    throw error;
  }
}

function authenticationUnavailable(): Response {
  return Response.json(
    { message: "Authentication is temporarily unavailable." },
    { status: 503 },
  );
}

function requestTooLarge(): Response {
  return Response.json(
    { code: "PAYLOAD_TOO_LARGE", message: "Request body too large." },
    { status: 413 },
  );
}

function signInBusy(): Response {
  return Response.json(
    {
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests. Please try again later.",
    },
    { status: 429, headers: { "Retry-After": "5" } },
  );
}

export const GET = handleAuth;

async function handleBoundedAuth(request: Request): Promise<Response> {
  try {
    await readBoundedRequestBody(request.clone(), MAX_AUTH_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return requestTooLarge();
    return authenticationUnavailable();
  }
  return handleAuth(request);
}

export const PATCH = handleBoundedAuth;
export const PUT = handleBoundedAuth;
export const DELETE = handleBoundedAuth;

export async function POST(request: Request): Promise<Response> {
  if (isPublicOwnerRegistration(request)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (!useEmailSignInCapacityGuard || !isEmailSignInRequest(request)) {
    return handleBoundedAuth(request);
  }

  try {
    await readBoundedRequestBody(request.clone(), MAX_AUTH_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return requestTooLarge();
    return authenticationUnavailable();
  }

  const releaseAdmission = tryAdmitEmailSignIn();
  if (!releaseAdmission) return signInBusy();
  try {
    let delay: number;
    try {
      const secret = process.env.APP_SECRET;
      if (!secret?.trim()) return authenticationUnavailable();
      const identity = await readEmailSignInIdentity(request);
      delay = await reserveEmailSignInAttempt(db, identity, secret);
    } catch {
      return authenticationUnavailable();
    }
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));

    const releaseWork = await acquireEmailSignInWork();
    if (!releaseWork) return signInBusy();
    try {
      return await handleAuth(request);
    } finally {
      releaseWork();
    }
  } finally {
    releaseAdmission();
  }
}
