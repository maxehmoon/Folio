export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export type DatabaseRuntimeConfig = {
  dialect: "postgres" | "sqlite";
  poolSize: number;
  url?: string;
};

function requestHost(headers: Headers, requestUrl?: string): string | undefined {
  const value = headers.get("host")?.trim();
  if (!value) {
    try {
      return requestUrl ? new URL(requestUrl).host.toLowerCase() : undefined;
    } catch {
      return undefined;
    }
  }
  if (value.includes(",") || /[\s\\/@?#]/.test(value)) return undefined;

  try {
    const url = new URL(`http://${value}`);
    // Preserve an explicit port until the actual protocol is known. Parsing
    // through HTTP would otherwise drop :80 even for an HTTPS destination.
    const port = value.match(/:(\d+)$/)?.[1];
    return `${url.hostname}${port ? `:${Number(port)}` : ""}`.toLowerCase();
  } catch {
    return undefined;
  }
}

function protocolFromMatchingUrl(
  value: string | null,
  host: string,
): "http:" | "https:" | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      if (url.host.toLowerCase() === new URL(`${url.protocol}//${host}`).host) {
        return url.protocol;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Resolve the origin the browser used without accepting a submitted Origin as
 * authority for the host. Normal reverse proxies preserve Host and set
 * X-Forwarded-Proto, so a domain works without per-install configuration.
 */
export function requestPublicOrigin(
  request: Request | Headers,
): string | undefined {
  const headers = request instanceof Headers ? request : request.headers;
  const requestUrl = request instanceof Headers ? undefined : request.url;
  const host = requestHost(headers, requestUrl);
  if (!host) return undefined;

  const forwardedProtocol = headers
    .get("x-forwarded-proto")
    ?.split(",", 1)[0]
    ?.trim()
    .toLowerCase();
  // Next standalone may use its internal bind address in request.url. Its
  // transport is still the fallback when no browser/proxy protocol is given.
  // Headers-only server calls receive X-Forwarded-Proto from Next; a bare
  // Host defaults to HTTP without classifying hostnames or network ranges.
  const requestUrlProtocol = requestUrl ? new URL(requestUrl).protocol : undefined;
  const protocol =
    (forwardedProtocol === "http" || forwardedProtocol === "https"
      ? `${forwardedProtocol}:`
      : undefined) ??
    // The destination transport wins over the page which initiated a request:
    // an HTTP Referer must not downgrade cookies on an HTTPS navigation.
    protocolFromMatchingUrl(requestUrl ?? null, host) ??
    protocolFromMatchingUrl(headers.get("origin"), host) ??
    protocolFromMatchingUrl(headers.get("referer"), host) ??
    (requestUrlProtocol === "http:" || requestUrlProtocol === "https:"
      ? requestUrlProtocol
      : "http:");

  return new URL(`${protocol}//${host}`).origin;
}

export function trustedRequestOrigins(request?: Request): string[] {
  const origin = request ? requestPublicOrigin(request) : undefined;
  return origin ? [origin] : [];
}

export function requestWithPublicOrigin(request: Request): Request {
  const origin = requestPublicOrigin(request);
  if (!origin || new URL(request.url).origin === origin) return request;

  const url = new URL(request.url);
  const publicUrl = new URL(origin);
  url.protocol = publicUrl.protocol;
  url.hostname = publicUrl.hostname;
  url.port = publicUrl.port;
  return new Request(url, request);
}

export function readDatabaseConfig(
  environment: RuntimeEnvironment = process.env,
): DatabaseRuntimeConfig {
  const configuredDialect = environment.DATABASE_DIALECT
    ?.trim()
    .toLowerCase();
  const url = environment.DATABASE_URL?.trim() || undefined;
  const urlIsPostgres =
    url?.toLowerCase().startsWith("postgres://") === true ||
    url?.toLowerCase().startsWith("postgresql://") === true;

  if (
    configuredDialect &&
    configuredDialect !== "sqlite" &&
    configuredDialect !== "postgres" &&
    configuredDialect !== "postgresql"
  ) {
    throw new Error(
      `Unsupported DATABASE_DIALECT "${configuredDialect}". Use "sqlite" or "postgres".`,
    );
  }

  const dialect =
    configuredDialect === "postgres" || configuredDialect === "postgresql"
      ? "postgres"
      : configuredDialect === "sqlite"
        ? "sqlite"
        : urlIsPostgres
          ? "postgres"
          : "sqlite";

  if (url && dialect === "postgres" && !urlIsPostgres) {
    throw new Error(
      "DATABASE_DIALECT is postgres but DATABASE_URL is not a PostgreSQL URL.",
    );
  }
  if (urlIsPostgres && dialect === "sqlite") {
    throw new Error(
      "DATABASE_DIALECT is sqlite but DATABASE_URL is a PostgreSQL URL.",
    );
  }

  const configuredPoolSize = environment.DATABASE_POOL_SIZE?.trim() || undefined;
  const poolSize = configuredPoolSize
    ? Number.parseInt(configuredPoolSize, 10)
    : 10;
  if (
    !Number.isSafeInteger(poolSize) ||
    poolSize < 1 ||
    (configuredPoolSize !== undefined && `${poolSize}` !== configuredPoolSize)
  ) {
    throw new Error("DATABASE_POOL_SIZE must be a positive integer.");
  }

  return { dialect, poolSize, ...(url ? { url } : {}) };
}
