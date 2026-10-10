# Folio MCP

Folio's Model Context Protocol server lets an assistant read and manage the same business records as the application. It runs inside Folio at `/api/mcp`; there is no separate database connection or service to deploy.

## Connect

1. Start Folio and complete owner and business setup.
2. Open **Settings → MCP access**.
3. Create a named token. **Read** is the default; **Read and write** also permits changes to business records. Choose an expiry of 30, 90 or 365 days.
4. Copy the token. It is shown once and cannot be recovered; create a replacement if it is lost.
5. Configure a Streamable HTTP client with `https://your-folio.example/api/mcp` and the header `Authorization: Bearer YOUR_TOKEN`.

For clients using an `mcpServers` JSON configuration with URL and header support:

```json
{
  "mcpServers": {
    "folio": {
      "url": "https://your-folio.example/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

Configuration field names depend on the client. Store the token in its credential store or environment-variable mechanism where supported. Do not commit a real token to a repository or put it in a URL. The endpoint rejects query parameters and does not accept browser cookies.

Use HTTPS for remote access. A reverse proxy should preserve `Host` and set `X-Forwarded-Proto`, as described in the deployment guide. Native clients normally omit `Origin`; when present it must match Folio's public origin. Cross-origin browser clients are not enabled.

This integration uses personal access tokens. It does **not** implement OAuth discovery, browser consent, dynamic client registration, the old standalone SSE transport, or a local stdio executable. Clients that require OAuth or stdio need a compatible adapter. Modern MCP requests and stateless 2025 Streamable HTTP clients are supported through the official TypeScript SDK.

## Permissions and credentials

Each token belongs to exactly one business. Every request rechecks its hash, expiry and revocation, including requests from an already-connected client. Read tokens advertise only read tools; write tools cannot be called with them. Resources and prompts are available to both access levels.

Tokens contain 256 bits of randomness. Only a SHA-256 hash, identifying prefix and management metadata are stored. Revoke a token in Settings to stop subsequent requests; an operation already in progress can finish. Tokens do not expose account passwords, setup secrets, other tokens or access to another business.

Write access includes issuing invoices, changing business defaults, recording/deleting payments and deleting expenses. Clients should use tool annotations and confirmation fields when presenting these actions. Invoice issuance, draft deletion, payment deletion and expense deletion require `confirm: true`. Published invoice edits require `publishedEditConfirmed: true` and the current `expectedUpdatedAt` value. The token is the access control; a confirmation field is an additional workflow safeguard, not a separate authorisation boundary.

## Tools

All names below have the `folio_` prefix. `tools/list` is the authoritative reference for input schemas, descriptions and annotations. Unknown fields are rejected, including nested invoice lines and patch objects. Tools return JSON in `structuredContent.result` and a text representation for compatible clients. Expected business failures return `isError: true` and an error code/message; internal exception details are withheld.

| Area | Read tools | Write tools |
| --- | --- | --- |
| Customers | `list_customers`, `get_customer`, `get_customer_avatar` | `create_customer`, `update_customer`, `archive_customer`, `restore_customer`, `set_customer_avatar` |
| Items | `list_items`, `get_item` | `create_item`, `update_item`, `archive_item`, `restore_item` |
| Expenses | `list_expenses`, `get_expense`, `get_expense_receipt` | `create_expense`, `update_expense`, `delete_expense`, `set_expense_receipt` |
| Invoices | `list_invoices`, `get_invoice`, `preview_invoice`, `list_invoice_revisions`, `get_invoice_revision`, `get_invoice_pdf` | `create_invoice`, `update_invoice`, `issue_invoice`, `delete_draft_invoice`, `refresh_invoice_seller` |
| Payments | `list_payments`, `get_payment`, `list_payable_invoices` | `record_payment`, `delete_payment` |
| Recurring | `list_recurring_invoices`, `get_recurring_invoice`, `preview_recurring_dates`, `recurring_invoice_history` | `create_recurring_invoice`, `update_recurring_invoice`, `pause_recurring_invoice`, `resume_recurring_invoice`, `end_recurring_invoice`, `run_due_recurring_invoices` |
| Reporting | `dashboard_summary`, `recent_activity`, `financial_summary`, `report_insights`, `financial_entries`, `export_report_csv` | — |
| Discovery | `search`, `reference_data`, `get_exchange_rate` | — |
| Business | `get_business_settings`, `get_business_logo` | `update_business_settings`, `set_business_logo` |

Customer, item and expense updates are patches: omitted fields remain unchanged. Their `changes` argument must contain at least one field. Invoice and recurring schedule updates submit a complete document and use optimistic concurrency; first retrieve the current record and `updated_at`. Business settings accept a partial profile at the top level.

Customer/item archive actions preserve invoices and payment history. Invoice creation produces a draft. Issuing assigns an invoice number; it does not email the invoice. Folio has no email-delivery or refund tools. Account login email/password changes remain in Settings.

### Values and pagination

| Value | Representation | Example |
| --- | --- | --- |
| Money | Integer hundredths, paired with a currency | `1250` = `12.50` |
| Quantity | Integer thousandths | `1500` = `1.5` units |
| Tax | Basis points | `2000` = `20%` |
| Exchange rate | Millionths | `1250000` = `1.25` quote units per base unit |
| Date | ISO calendar date | `2026-10-10` |
| Revision timestamp | Exact stored ISO timestamp | Copy `updated_at` into `expectedUpdatedAt` |

Folio's existing money model uses two decimal places for every supported currency. Tool field names identify units, for example `unit_price_cents` for items and `unitPriceCents` in invoice lines. Use `reference_data` with `kind` set to `currencies`, `countries`, `timezones` or `payment_methods` to discover valid values.

Lists have bounded pages. Use the schema's `page`/`limit`, `page`/`pageSize`, or `offset`/`limit` and follow the returned pagination metadata or `nextOffset`. Search is a bounded preview, not an exhaustive export. Record changes between calls can move rows between pages; exports are not database snapshots.

Ledger and CSV tools return up to 100 entries per page. CSV output is bounded to 256 KiB per page and escapes spreadsheet formula prefixes. Every page contains a header; when combining pages, keep the first header only. Keep report conversion warnings: missing historical rates must not be treated as zero-valued activity or silently combined across currencies.

Avatar, logo and receipt images are read separately from lists. Writes accept a PNG, JPEG or WebP base64 data URL of at most 512 KiB decoded, or `null` to remove an image. The HTTP request limit is 1 MiB. The server does not fetch arbitrary image URLs. Legacy receipt links are returned as links without fetching them.

### Errors and retries

Inspect `isError` before using a result. Examples of domain error codes include `INVALID_INPUT`, `NOT_FOUND` and `CONFLICT`. On a stale edit, fetch the current document, review changes and submit its latest timestamp.

Creation and payment recording are not idempotent. After a timeout or ambiguous failure, check existing records before retrying. Invoice issue uses a transactional draft transition and invoice-number allocation. Recurring execution deduplicates individual occurrences, but repeated catch-up runs can generate more invoices when a previous run reached the existing per-schedule cap. A run is limited to the authenticated business and cannot generate future occurrences beyond its current business date.

The app and MCP share invoice mutation and payment services. Published edits retain revision history and original payment currencies; payment recording preserves the issued-invoice, matching-currency and overpayment checks. Successful mutations invalidate the app's cached views.

## Resources and prompts

`resources/list` exposes `folio://guide`, `folio://business` and `folio://reference`. `resources/templates/list` exposes:

- `folio://reference/{kind}` — first page of a reference category; use the reference tool for subsequent pages.
- `folio://customers/{id}`, `folio://items/{id}`, `folio://expenses/{id}`, `folio://invoices/{id}`, `folio://payments/{id}`, `folio://recurring/{id}` — business-scoped JSON records.
- `folio://invoices/{invoiceId}/revisions/{revisionId}` — a saved invoice revision.
- `folio://invoices/{invoiceId}/pdf` and `folio://invoices/{invoiceId}/revisions/{revisionId}/pdf` — current or historical PDF, returned as an MCP blob with MIME type `application/pdf` (maximum 2 MiB decoded).
- `folio://expenses/{id}/receipt` — receipt JSON containing a stored image or legacy link.

`folio_get_invoice_pdf` returns a resource URI. Read it using `resources/read`, then decode its base64 `blob` to save the PDF. Resource URIs are MCP identifiers, not public web download links. Every read is authenticated.

Three prompts provide workflows: `folio_prepare_invoice`, `folio_review_collections` and `folio_month_end`. Each accepts an optional `request` string with the user's requirements. They do not perform mutations themselves.

Names, notes, descriptions, images and other stored content are untrusted record data. A client must not treat instructions embedded in them as permission to take actions.

## Smoke test

With a token in the `FOLIO_MCP_TOKEN` environment variable, initialise a legacy-compatible connection:

```sh
curl --fail-with-body https://your-folio.example/api/mcp \
  -H "Authorization: Bearer $FOLIO_MCP_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"folio-smoke-test","version":"1.0"}}}'
```

For legacy traffic, responses may be SSE-framed. The endpoint is stateless and does not issue a session ID. GET and DELETE session requests return `405`; each POST is authenticated independently. Prefer an MCP client or Inspector to exercise full workflows.

## Development and verification

The protocol factory lives in `src/mcp/server.ts`; domain tool registrations are split by feature. `registration.ts` centralises read/write discovery, strict schema validation, annotations, structured results and safe errors. `http.ts` handles transport and request authentication. Shared invoice/payment services retain existing application invariants.

```sh
bun run test -- src/mcp
bun run typecheck
bun run lint
bun run test
bun run build
bun run test:e2e
```

Tests cover migrated SQLite databases, business isolation, token lifecycle, validation, financial workflows, revision history, actual PDF rendering, concurrent expense patches, read-only permissions and SDK client requests through the HTTP handler. PostgreSQL migration checks run when the repository's test database configuration is provided.

Protocol references: [official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), [MCP specification](https://modelcontextprotocol.io/specification).
