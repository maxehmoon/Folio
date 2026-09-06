import { createHmac, randomUUID } from "node:crypto";

import { sql } from "kysely";

import { readBoundedRequestBody } from "@/lib/bounded-request-body";
import type { DatabaseExecutor } from "@/lib/db";

export const MAX_AUTH_BODY_BYTES = 16 * 1024;

export const EMAIL_SIGN_IN_CAPACITY = {
  admitted: 6,
  concurrent: 2,
  workWaitMilliseconds: 5_000,
} as const;

export const EMAIL_SIGN_IN_BACKOFF = {
  freeAttempts: 3,
  stepMilliseconds: 250,
  maximumMilliseconds: 2_000,
  windowSeconds: 10,
} as const;

const KEY_PREFIX = "folio:email-sign-in:v2:";
const INVALID_IDENTITY = "\0invalid-email-body";
const JSON_CONTENT_TYPE = /^application\/([a-z0-9.+-]*\+)?json/i;
const SIGN_IN_MEDIA_TYPES = [
  "application/x-www-form-urlencoded",
  "application/json",
] as const;

type WaitingWork = {
  admit: () => void;
  timer: ReturnType<typeof setTimeout>;
};

type SignInCapacityState = {
  admitted: number;
  activeWork: number;
  waitingWork: WaitingWork[];
};

const capacityGlobal = globalThis as typeof globalThis & {
  __folioSignInCapacity?: SignInCapacityState;
};

function state(): SignInCapacityState {
  capacityGlobal.__folioSignInCapacity ??= {
    admitted: 0,
    activeWork: 0,
    waitingWork: [],
  };
  return capacityGlobal.__folioSignInCapacity;
}

export function tryAdmitEmailSignIn(): (() => void) | null {
  const capacity = state();
  if (capacity.admitted >= EMAIL_SIGN_IN_CAPACITY.admitted) return null;
  capacity.admitted += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    capacity.admitted -= 1;
  };
}

function releaseEmailSignInWork(capacity: SignInCapacityState): void {
  const next = capacity.waitingWork.shift();
  if (next) {
    clearTimeout(next.timer);
    next.admit();
    return;
  }
  capacity.activeWork -= 1;
}

export async function acquireEmailSignInWork(): Promise<(() => void) | null> {
  const capacity = state();
  if (capacity.activeWork < EMAIL_SIGN_IN_CAPACITY.concurrent) {
    capacity.activeWork += 1;
    return () => releaseEmailSignInWork(capacity);
  }

  return new Promise((resolve) => {
    const admit = () => resolve(() => releaseEmailSignInWork(capacity));
    const timer = setTimeout(() => {
      const index = capacity.waitingWork.findIndex(
        (waiting) => waiting.admit === admit,
      );
      if (index !== -1) capacity.waitingWork.splice(index, 1);
      resolve(null);
    }, EMAIL_SIGN_IN_CAPACITY.workWaitMilliseconds);
    timer.unref();
    capacity.waitingWork.push({ admit, timer });
  });
}

function normalisedContentType(request: Request): string {
  return request.headers.get("content-type")?.toLowerCase() ?? "";
}

function normaliseEmail(value: unknown): string {
  return typeof value === "string" && value.length > 0
    ? value.trim().toLowerCase()
    : INVALID_IDENTITY;
}

function lastFormValue(parameters: URLSearchParams, name: string): string | null {
  let result: string | null = null;
  parameters.forEach((value, key) => {
    if (key === name) result = value;
  });
  return result;
}

export async function readEmailSignInIdentity(request: Request): Promise<string> {
  const body = await readBoundedRequestBody(request.clone(), MAX_AUTH_BODY_BYTES);
  const encoded = new TextDecoder().decode(body);
  const contentType = normalisedContentType(request);
  const baseType = contentType.split(";", 1)[0]?.trim() ?? "";
  if (
    !SIGN_IN_MEDIA_TYPES.some(
      (allowed) => baseType === allowed || baseType.includes(allowed),
    )
  ) {
    return INVALID_IDENTITY;
  }

  try {
    if (JSON_CONTENT_TYPE.test(contentType)) {
      const parsed: unknown = JSON.parse(encoded);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return INVALID_IDENTITY;
      }
      return normaliseEmail((parsed as Record<string, unknown>).email);
    }
    return normaliseEmail(
      lastFormValue(new URLSearchParams(encoded), "email"),
    );
  } catch {
    return INVALID_IDENTITY;
  }
}

export function emailSignInBackoffKey(
  identity: string,
  secret: string,
): string {
  const digest = createHmac("sha256", secret)
    .update("folio/email-sign-in/v2\0")
    .update(identity)
    .digest("hex");
  return `${KEY_PREFIX}${digest}`;
}

export async function reserveEmailSignInAttempt(
  database: DatabaseExecutor,
  identity: string,
  secret: string,
  now = Date.now(),
): Promise<number> {
  const windowStart = now - EMAIL_SIGN_IN_BACKOFF.windowSeconds * 1_000;
  const maximumTrackedAttempts =
    EMAIL_SIGN_IN_BACKOFF.freeAttempts +
    Math.ceil(
      EMAIL_SIGN_IN_BACKOFF.maximumMilliseconds /
        EMAIL_SIGN_IN_BACKOFF.stepMilliseconds,
    );
  const count = sql.ref("auth_rate_limit.count");
  const lastRequest = sql.ref("auth_rate_limit.last_request");

  await database
    .deleteFrom("auth_rate_limit")
    .where("key", "like", `${KEY_PREFIX}%`)
    .where("last_request", "<=", windowStart)
    .execute();

  const row = await database
    .insertInto("auth_rate_limit")
    .values({
      id: randomUUID(),
      key: emailSignInBackoffKey(identity, secret),
      count: 1,
      last_request: now,
    })
    .onConflict((conflict) =>
      conflict.column("key").doUpdateSet({
        count: sql<number>`case
          when ${lastRequest} <= ${windowStart} then 1
          when ${count} < ${maximumTrackedAttempts} then ${count} + 1
          else ${count}
        end`,
        last_request: now,
      }),
    )
    .returning("count")
    .executeTakeFirstOrThrow();

  return Math.min(
    EMAIL_SIGN_IN_BACKOFF.maximumMilliseconds,
    Math.max(0, row.count - EMAIL_SIGN_IN_BACKOFF.freeAttempts) *
      EMAIL_SIGN_IN_BACKOFF.stepMilliseconds,
  );
}

export function resetEmailSignInCapacityForTests(): void {
  const capacity = capacityGlobal.__folioSignInCapacity;
  if (capacity) {
    for (const waiting of capacity.waitingWork) clearTimeout(waiting.timer);
  }
  delete capacityGlobal.__folioSignInCapacity;
}
