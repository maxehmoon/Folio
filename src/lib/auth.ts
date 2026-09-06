import { createHash, randomUUID } from "node:crypto";

import { betterAuth, type BetterAuthOptions } from "better-auth";
import { nextCookies } from "better-auth/next-js";

import { db, getDatabaseDialect } from "@/lib/db";
import { debugLog } from "@/lib/logger";
import {
  requestPublicOrigin,
  trustedRequestOrigins,
} from "@/lib/runtime-config";

export const useEmailSignInCapacityGuard =
  process.env.NODE_ENV === "production";

function requestCookiePrefix(request: Request | Headers, origin: string) {
  const headers = request instanceof Headers ? request : request.headers;
  const names = new Set(
    (headers.get("cookie") ?? "").split(";").map((cookie) => cookie.split("=", 1)[0].trim()),
  );
  const securePrefix = origin.startsWith("https:") ? "__Secure-" : "";
  const legacyPrefix = `folio-${createHash("sha256").update(origin).digest("hex").slice(0, 10)}`;
  // Older installations with a configured URL used origin-specific names.
  // Keep those sessions readable without trusting a cookie's value or letting
  // an HTTP cookie become a session on HTTPS. New sessions use the plain name.
  return !names.has(`${securePrefix}folio.session_token`) &&
    names.has(`${securePrefix}${legacyPrefix}.session_token`)
    ? legacyPrefix
    : "folio";
}

function authLog(
  level: "debug" | "info" | "warn" | "error",
) {
  // Library messages can contain credentials or submitted account details.
  // Request status/timing is logged separately without forwarding raw payloads.
  if (level === "error") console.error("Folio authentication encountered an error.");
  else if (level === "warn") console.warn("Folio authentication reported a warning.");
  else if (level === "debug") debugLog("auth.library.debug");
  else debugLog("auth.library.info");
}

export const authOptions = {
  appName: "Folio",
  secret: process.env.APP_SECRET,
  // Forward replacement session cookies from account-setting server actions.
  plugins: [nextCookies()],
  logger: { log: authLog },
  // Keep the dependency endpoint unavailable to browsers. The account
  // settings action performs current-password verification before calling the
  // same endpoint directly through auth.api, which bypasses transport paths.
  disabledPaths: ["/change-email"],
  trustedOrigins: (request) => trustedRequestOrigins(request),
  database: {
    db,
    type: getDatabaseDialect(),
    transaction: true,
  },
  emailAndPassword: {
    enabled: true,
    // The setup token already proves that this browser may claim the fresh
    // installation. Creating the initial session in the same transaction as
    // the owner avoids committing a half-finished installation that then
    // requires an immediate, failure-prone second sign-in.
    autoSignIn: true,
  },
  rateLimit: {
    storage: "database",
    modelName: "auth_rate_limit",
    fields: {
      key: "key",
      count: "count",
      lastRequest: "last_request",
    },
    // Better Auth has no request-aware key hook. Without a trusted client IP,
    // its shared bucket would let an attacker lock out the installation. The
    // route instead bounds concurrent password work without retaining a
    // denial state for a targeted account.
    ...(useEmailSignInCapacityGuard
      ? { customRules: { "/sign-in/email": false } }
      : {}),
  },
  advanced: {
    cookiePrefix: "folio",
    // The route adapter resolves Folio's public URL from the ordinary Host
    // header. Better Auth must not independently prefer a spoofable forwarded
    // host over that request URL.
    trustedProxyHeaders: false,
    database: {
      generateId: () => randomUUID(),
    },
    ipAddress: {
      // Folio is often exposed directly from Docker. Ignoring caller-supplied
      // proxy headers by default prevents trivial rate-limit bucket spoofing.
      ipAddressHeaders: [],
    },
  },
  user: {
    changeEmail: {
      enabled: true,
      updateEmailWithoutVerification: true,
    },
    modelName: "auth_user",
    fields: {
      emailVerified: "email_verified",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  session: {
    modelName: "auth_session",
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      userId: "user_id",
    },
  },
  account: {
    modelName: "auth_account",
    fields: {
      accountId: "account_id",
      providerId: "provider_id",
      userId: "user_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  verification: {
    modelName: "auth_verification",
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
} satisfies BetterAuthOptions;

export function getAuth(request: Request | Headers) {
  const baseURL = requestPublicOrigin(request);
  if (!baseURL) throw new Error("Cannot resolve the authentication request origin.");

  // Better Auth chooses cookie names and Secure attributes at initialisation,
  // before its handler resolves a missing baseURL. Bind them to this request
  // for both HTTP routes and direct server API calls, without shared mutation.
  return betterAuth({
    ...authOptions,
    baseURL,
    advanced: {
      ...authOptions.advanced,
      cookiePrefix: requestCookiePrefix(request, baseURL),
    },
  });
}
