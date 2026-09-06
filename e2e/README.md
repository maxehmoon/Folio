# Browser authentication regression tests

Run with Node.js 24+, Bun, OpenSSL and Chromium:

```sh
bun install --frozen-lockfile
bun x playwright install chromium
bun run build
bun run test:e2e
```

The tests start the production build on ephemeral loopback ports, with a fresh
temporary SQLite database and automatically generated secrets for each test.
They do not use Docker, the development database or an existing Folio instance.
Temporary servers, TLS certificates and data are removed afterwards.
Only `FOLIO_DATA_DIR` selects storage: `folio.sqlite`, `app-secret` and
`setup-token` must be generated directly inside that temporary directory. Each
scenario restarts Folio with the same data directory and checks the browser
session and saved organisation settings survive.

Chromium resolves the ordinary hostname `folio-e2e` to loopback, without giving
it the browser's special `localhost` cookie exemption. Tests cover owner setup,
every organisation step, sign-out, sign-in, a password change (including revoking
the old session) and navigation without an Origin or Referer header. The HTTPS
case adds a TLS-terminating reverse proxy that preserves Host and sets
`X-Forwarded-Proto`. No public URL is configured. A third scenario supplies
`DEFAULT_COUNTRY=DE` and `DEFAULT_CURRENCY=EUR`, checks the setup prefills, then
overrides them with GB/GBP and checks those choices survive draft reload and
restart. Explicit empty secret and legacy configuration values isolate the
tests from any local `.env` file.
Cookie assertions check browser acceptance, `HttpOnly`, `SameSite` and the correct
HTTP/HTTPS `Secure` behaviour. Failed runs keep traces in `tmp/playwright-results`.
