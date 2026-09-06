import { trustedRequestOrigins } from "@/lib/runtime-config"

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin")
  const fetchSite = request.headers.get("sec-fetch-site")

  if (fetchSite === "cross-site") return false
  if (!origin) return true

  return trustedRequestOrigins(request).includes(origin)
}

export function redirectFromSetup(
  _request: Request,
  destination: string,
  headers?: HeadersInit,
) {
  const responseHeaders = new Headers(headers)
  // Keep this relative. Next standalone sees its internal bind address in
  // request.url (usually http://0.0.0.0:3000), which is not necessarily the
  // browser-facing origin or port. A relative Location also behaves correctly
  // behind a reverse proxy without trusting forwarded host headers here.
  responseHeaders.set("location", destination)

  return new Response(null, { status: 303, headers: responseHeaders })
}

type SetupFormResponseOptions = {
  destination: string
  error?: string
  headers?: HeadersInit
  status?: number
}

export function setupFormResponse(
  request: Request,
  {
    destination,
    error,
    headers,
    status = error ? 422 : 200,
  }: SetupFormResponseOptions,
) {
  if (!request.headers.get("accept")?.includes("application/json")) {
    return redirectFromSetup(request, destination, headers)
  }

  const responseHeaders = new Headers(headers)
  return Response.json(
    error
      ? { error, ok: false }
      : { ok: true, redirectTo: destination },
    { headers: responseHeaders, status },
  )
}
