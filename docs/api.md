# Folio HTTP API

Folio's versioned HTTP API lets scripts and applications manage the same business records as the web interface. It runs at `/api/v1` inside Folio, using ordinary HTTP and JSON. No MCP client or separate service is required.

## Authentication

Complete owner and business setup, then open **Settings → API and MCP access**. Create a named token with **Read only** or **Read and write** access and an expiry of 30, 90 or 365 days. Copy the token when it appears; it is shown once. Existing MCP tokens also work with the API.

Send the token in an HTTP header on every request:

```http
Authorization: Bearer YOUR_TOKEN
```

Each token is restricted to one business. Read tokens can use all read operations, including invoice and recurring-date previews; a write operation returns `403` unless the token has read and write access. Folio rechecks token expiry and revocation on every request. Revoking a token in Settings stops subsequent requests; an operation already in progress may finish. Only the token hash, identifying prefix and management metadata are stored.

Use HTTPS for remote connections and keep tokens in your application's secret store. Do not put tokens in URLs, browser storage or source control. Browser login cookies do not authenticate the API, and query-string credentials are rejected. Native HTTP clients normally omit `Origin`; if supplied, it must match Folio's public origin. Cross-origin browser access is not enabled. Configure reverse-proxy headers as described in the [deployment guide](../README.md#deployment).

## Request and response conventions

All paths below are relative to `/api/v1`. `GET /api/v1` returns the API version and OpenAPI location. Fetch the authenticated OpenAPI 3.1.1 document for the exact request fields, required values, defaults and access requirements:

```sh
export FOLIO_URL='https://your-folio.example'
export FOLIO_TOKEN='YOUR_TOKEN'

curl --fail-with-body "$FOLIO_URL/api/v1/openapi.json" \
  -H "Authorization: Bearer $FOLIO_TOKEN" \
  -o folio-openapi.json
```

GET filters use query parameters. Numbers use numeric text, such as `page=2`, and booleans use `true` or `false`. Unknown or duplicate query parameters are rejected. Requests with bodies use `Content-Type: application/json` and a JSON object; bodies are limited to 1 MiB, including streamed requests. Do not repeat path identifiers in the body. POST, PUT, PATCH and DELETE fields belong in the body, not the query string. Actions with no fields may omit the body or send `{}`.

JSON results use a `data` envelope. For example, a customer creation response contains `{ "data": { "id": "…", "name": "…", "…": "…" } }`; an invoice response contains `{ "data": { "invoice": { "…": "…" }, "lines": [], "payments": [], "…": "…" } }`. Collection results contain their records and pagination metadata inside `data`. Creation returns `201`; other successful operations return `200`. Deletions return a JSON confirmation. OpenAPI, PDF and CSV responses use their native formats without the envelope. GET endpoints also support HEAD without a response body. Responses are private and must not be cached.

Unknown fields are rejected, including nested invoice lines. Customer, item and expense PATCH bodies contain the changed fields directly, for example `{ "name": "Updated name" }`; there is no `changes` wrapper. Omitted patch fields remain unchanged, and nullable fields can be cleared with `null`. Invoice and recurring-invoice PUT requests submit the complete editable document, including all lines. Business PATCH accepts a partial profile; clear its optional text fields with an empty string rather than `null`.

Field spelling follows the domain schemas: customer and expense fields use names such as `default_currency` and `subtotal_cents`, while invoice inputs use `customerId` and `unitPriceCents`. Read the OpenAPI document before constructing a request; response records can use different field names from their write inputs.

## Endpoint catalogue

| Resource | Methods and paths | Behaviour |
| --- | --- | --- |
| Customers | `GET /customers`, `POST /customers` | List/search or create customers |
| Customer | `GET /customers/{id}`, `PATCH /customers/{id}` | Read or patch a customer |
| Customer status | `POST /customers/{id}/archive`, `POST /customers/{id}/restore` | Preserve history while changing active status |
| Customer avatar | `GET /customers/{id}/avatar`, `PUT /customers/{id}/avatar` | Read or replace/remove the image with `data_url` |
| Items | `GET /items`, `POST /items` | List/search or create reusable invoice items |
| Item | `GET /items/{id}`, `PATCH /items/{id}` | Read or patch an item |
| Item status | `POST /items/{id}/archive`, `POST /items/{id}/restore` | Archive or restore an item |
| Expenses | `GET /expenses`, `POST /expenses` | List/filter or create expenses |
| Expense | `GET /expenses/{id}`, `PATCH /expenses/{id}`, `DELETE /expenses/{id}` | Read, patch or permanently delete an expense |
| Expense receipt | `GET /expenses/{id}/receipt`, `PUT /expenses/{id}/receipt` | Read or replace/remove a receipt with `data_url` |
| Invoice preview | `POST /invoices/preview` | Validate and calculate an invoice without saving |
| Invoices | `GET /invoices`, `POST /invoices` | List/filter invoices or create a draft |
| Invoice | `GET /invoices/{invoiceId}`, `PUT /invoices/{invoiceId}`, `DELETE /invoices/{invoiceId}` | Read, replace editable fields, or delete a draft |
| Invoice issue | `POST /invoices/{invoiceId}/issue` | Issue a reviewed draft and allocate its invoice number |
| Invoice seller | `POST /invoices/{invoiceId}/refresh-seller` | Refresh a draft's saved seller details from the business profile |
| Invoice history | `GET /invoices/{invoiceId}/revisions`, `GET /invoices/{invoiceId}/revisions/{revisionId}` | List saved versions or read one version |
| Invoice PDF | `GET /invoices/{invoiceId}/pdf`, `GET /invoices/{invoiceId}/revisions/{revisionId}/pdf` | Download the current or historical document |
| Payments | `GET /payments`, `POST /payments` | List/filter receipts or record money already received |
| Payment | `GET /payments/{paymentId}`, `DELETE /payments/{paymentId}` | Read or delete a recorded receipt |
| Payable invoices | `GET /payable-invoices` | List issued invoices with a positive balance |
| Recurring preview | `POST /recurring-invoices/preview-dates` | Preview schedule dates without saving |
| Recurring invoices | `GET /recurring-invoices`, `POST /recurring-invoices` | List/filter or create schedules |
| Recurring invoice | `GET /recurring-invoices/{id}`, `PUT /recurring-invoices/{id}` | Read or replace editable schedule fields and lines |
| Recurring status | `POST /recurring-invoices/{id}/pause`, `POST /recurring-invoices/{id}/resume`, `POST /recurring-invoices/{id}/end` | Change schedule state |
| Recurring execution | `POST /recurring-invoices/run-due`, `GET /recurring-invoices/{id}/history` | Generate due invoices or inspect execution history |
| Dashboard | `GET /dashboard/summary`, `GET /dashboard/activity` | Read dashboard metrics and recent activity |
| Reports | `GET /reports/summary`, `GET /reports/insights`, `GET /reports/entries` | Read financial reports and paginated ledger entries |
| CSV export | `GET /reports/entries.csv` | Download one page of ledger entries |
| Search | `GET /search?query=…` | Search across business records |
| Reference data | `GET /reference/{kind}` | List currencies, countries, timezones or payment methods |
| Exchange rates | `GET /exchange-rates?base=GBP&quote=EUR` | Look up a public rate, optionally with `date=YYYY-MM-DD` |
| Business | `GET /business`, `PATCH /business` | Read or update business details and invoice defaults |
| Business logo | `GET /business/logo`, `PUT /business/logo` | Read or replace/remove the logo with `dataUrl` |

Reference kinds are `currencies`, `countries`, `timezones` and `payment_methods`. Account login changes remain in Settings. Issuing an invoice does not email it, recording a payment does not charge a customer, and deleting a payment does not refund money.

## Create, issue and pay an invoice

This example requires `curl`, `jq` and a read and write token. Run each step after checking the previous result; these commands create real records. It uses the business reporting currency to avoid an external exchange-rate lookup.

Read the business currency and create a customer:

```sh
currency=$(curl --fail-with-body "$FOLIO_URL/api/v1/business" \
  -H "Authorization: Bearer $FOLIO_TOKEN" | jq -er '.data.currency')

customer=$(curl --fail-with-body "$FOLIO_URL/api/v1/customers" \
  -H "Authorization: Bearer $FOLIO_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"name":"Example customer","email":"billing@example.test"}')
customer_id=$(printf '%s' "$customer" | jq -er '.data.id')
```

Create a draft for one unit at 100.00 plus 20% tax. Dates use the business defaults; quantities, prices, tax and exchange rates are integers:

```sh
draft=$(jq -n --arg customerId "$customer_id" --arg currency "$currency" '{
  customerId: $customerId,
  currency: $currency,
  exchangeRateMicros: 1000000,
  lines: [{
    description: "Consultancy",
    unit: "service",
    quantityThousandths: 1000,
    unitPriceCents: 10000,
    taxRateBps: 2000
  }]
}' | curl --fail-with-body "$FOLIO_URL/api/v1/invoices" \
  -H "Authorization: Bearer $FOLIO_TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary @-)

printf '%s\n' "$draft" | jq '.data'
invoice_id=$(printf '%s' "$draft" | jq -er '.data.invoice.id')
updated_at=$(printf '%s' "$draft" | jq -er '.data.invoice.updated_at')
```

After reviewing the draft, issue it using the exact timestamp returned above:

```sh
issued=$(jq -n --arg updatedAt "$updated_at" \
  '{expectedUpdatedAt: $updatedAt, confirm: true}' \
  | curl --fail-with-body "$FOLIO_URL/api/v1/invoices/$invoice_id/issue" \
      -H "Authorization: Bearer $FOLIO_TOKEN" \
      -H 'Content-Type: application/json' \
      --data-binary @-)

printf '%s\n' "$issued" | jq '.data.invoice | {invoice_number, total_cents, issue_date}'
```

When the customer has paid 120.00 in that currency, record the receipt. Set `payment_date` to the actual date the payment was received:

```sh
payment_date='2026-10-10'

jq -n --arg invoiceId "$invoice_id" --arg currency "$currency" \
  --arg paymentDate "$payment_date" '{
    invoiceId: $invoiceId,
    currency: $currency,
    paymentDate: $paymentDate,
    amountCents: 12000,
    method: "bank_transfer",
    reference: "Example receipt"
  }' | curl --fail-with-body "$FOLIO_URL/api/v1/payments" \
      -H "Authorization: Bearer $FOLIO_TOKEN" \
      -H 'Content-Type: application/json' \
      --data-binary @-

curl --fail-with-body "$FOLIO_URL/api/v1/invoices/$invoice_id" \
  -H "Authorization: Bearer $FOLIO_TOKEN" \
  | jq '.data | {status, paidCents, balanceDueCents}'
```

The final result should show `paid`, `12000` and `0`. Payment references do not deduplicate requests. Check the payment list before retrying an uncertain payment result.

## Values, editing and retries

| Value | Representation | Example |
| --- | --- | --- |
| Money | Integer hundredths plus a currency | `1250` means `12.50` |
| Quantity | Integer thousandths | `1500` means `1.5` units |
| Tax | Basis points | `2000` means `20%` |
| Exchange rate | Millionths | `1250000` means `1.25` quote units per base unit |
| Date | ISO calendar date | `2026-10-10` |
| Revision timestamp | Exact stored ISO timestamp | Copy `updated_at` into `expectedUpdatedAt` |

Folio uses two decimal places for every supported currency. Payment recording requires an issued invoice, its current currency and an amount no greater than its remaining balance. Stored payment amounts and currencies survive subsequent invoice edits; allocations reflect the invoice's current currency.

Read an invoice or recurring schedule immediately before editing it and supply its current `updated_at` as `expectedUpdatedAt`. Invoice issuance, draft deletion and seller refresh also require that timestamp. Published invoice edits additionally require `publishedEditConfirmed: true`; they save the previous document in revision history. A stale invoice can return `CONFLICT` or `INVALID_STATE`, both with HTTP `409`; retrieve the latest document and review its changes before submitting again.

Invoice issuance, draft deletion, payment deletion and expense deletion require `confirm: true` in the JSON body. This records the client's acknowledgement of the action; it does not grant extra permission. For example:

```sh
curl --fail-with-body -X DELETE "$FOLIO_URL/api/v1/expenses/EXPENSE_ID" \
  -H "Authorization: Bearer $FOLIO_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"confirm":true}'
```

Do not automatically retry writes after a timeout or ambiguous failure. There is no idempotency-key facility. Creation and payment recording can create duplicates. Archive/restore and image replacement actions are idempotent, but deletion may return `404` on a later call. Invoice issuance uses a transactional draft transition and invoice-number allocation. Recurring execution deduplicates each occurrence, yet a second catch-up call can create additional invoices when the first reached its per-schedule cap. It is restricted to the token's business and cannot generate future occurrences beyond the current business date.

## Pagination and downloads

Use the endpoint's documented pagination fields and returned metadata:

- Customers, items and expenses use `page` and `limit`, with a maximum of 100 records.
- Invoices use `page` with a fixed size of 25. Payments and payable invoices use `page` and `pageSize`, up to 100; revision history allows up to 50.
- Recurring schedules/history, reference data and ledger entries use `offset` and `limit`, up to 100. Continue with `nextOffset` until it is `null`.
- An invoice detail includes at most 50 payments and revisions. Check the truncation flags and use the corresponding collection endpoints for the rest.

Search returns at most six results per entity type; it is a preview, not an exhaustive export. Records may change between pages, so paginated exports are not database snapshots.

Download a current PDF directly:

```sh
curl --fail-with-body "$FOLIO_URL/api/v1/invoices/$invoice_id/pdf" \
  -H "Authorization: Bearer $FOLIO_TOKEN" \
  -o invoice.pdf
```

For a historical PDF, use `/invoices/{invoiceId}/revisions/{revisionId}/pdf`, or provide `revisionId` on the current PDF route. PDF responses are binary `application/pdf` attachments, limited to 2 MiB. Images are separate JSON reads; PUT accepts PNG, JPEG or WebP base64 data URLs up to 512 KiB decoded, or `null` to remove the image. Customer avatars and expense receipts use `data_url`; business logos use `dataUrl`. Folio does not fetch arbitrary image URLs. Legacy receipt URLs are returned as links without fetching them.

CSV downloads contain up to 100 ledger entries and are limited to 256 KiB per page:

```sh
curl --fail-with-body \
  "$FOLIO_URL/api/v1/reports/entries.csv?from=2026-01-01&to=2026-10-10&limit=100&offset=0" \
  -H "Authorization: Bearer $FOLIO_TOKEN" \
  -D report-headers.txt -o report-page.csv
```

Read `X-Next-Offset` from the response headers and use it as the next `offset`; an empty value means the export is complete. `X-Total-Count`, `X-Page-Limit` and `X-Row-Count` describe the page. Every CSV page includes a header row; keep only the first when combining pages. Formula prefixes are escaped. Preserve currency-conversion provenance and warnings: missing historical rates must not become zero-valued activity or be silently combined across currencies.

## Errors

Errors use `{ "error": { "code": "INVALID_INPUT", "message": "…" } }`. Internal exception details are withheld. Always check the HTTP status before using the body.

| Status | Codes | Handling |
| --- | --- | --- |
| `400` | `INVALID_INPUT`, `INVALID_JSON` | Correct the query, body or values |
| `401` | `UNAUTHORISED` | Supply an active, unexpired bearer token |
| `403` | `FORBIDDEN` | Use a token with the required access, or correct the request origin |
| `404` | `NOT_FOUND` | Check the path and record ID within the token's business |
| `405` | `METHOD_NOT_ALLOWED` | Use a method listed in the `Allow` header |
| `409` | `CONFLICT`, `INVALID_STATE` | Read the current record and review its state before retrying |
| `413` | `PAYLOAD_TOO_LARGE` | Reduce the request below 1 MiB |
| `415` | `UNSUPPORTED_MEDIA_TYPE` | Send the body as `application/json` |
| `422` | `OUTPUT_TOO_LARGE`, `RESULT_TOO_LARGE` | Reduce a CSV page or download a large PDF from the invoice page |
| `500` | `INTERNAL_ERROR` | Check records before retrying a write; consult server logs |

The API shares its validated operations with [MCP](./mcp.md), and its invoice and payment services with the web interface. Successful writes refresh the application's cached views. The route map lives in `src/api/routes.ts`; OpenAPI is generated from the same input schemas used at runtime.
