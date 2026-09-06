<p align="center">
  <img src="./public/folio-mark-white.svg" width="72" alt="Folio logo">
</p>

<h1 align="center">Folio</h1>

<p align="center">
  <strong>Self-hosted invoicing.</strong>
</p>

<p align="center">
  Issue invoices, record payments and expenses, schedule recurring billing,<br>
  and keep the records on your own server.
</p>

<p align="center">
  <img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-18181b">
  <img alt="Docker Compose" src="https://img.shields.io/badge/deploy-Docker%20Compose-2496ED?logo=docker&logoColor=white">
  <img alt="SQLite and PostgreSQL" src="https://img.shields.io/badge/database-SQLite%20%7C%20PostgreSQL-3f3f46">
  <img alt="Self-hosted" src="https://img.shields.io/badge/cloud-not%20required-16a34a">
</p>

## What Folio does

- Creates drafts and searchable A4 PDF invoices in multiple currencies. Issued invoices retain the customer and seller details used at the time.
- Records full and partial payments, blocks overpayments, and tracks outstanding and overdue balances.
- Stores customers, billing addresses and reusable invoice lines.
- Issues invoices from recurring schedules that can be paused and resumed.
- Records expenses and receipt images, then reports sales, receipts, expenses, cash net income and collections.
- Exports report data as CSV.

## Run with Docker Compose

Create `compose.yaml`:

```yaml
services:
  folio:
    image: ghcr.io/maxehmoon/folio:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    volumes:
      - folio_data:/data

volumes:
  folio_data:
```

Start Folio and read the setup token:

```sh
docker compose up -d
docker compose logs folio
```

Open [http://localhost:3000/setup](http://localhost:3000/setup), copy the setup token from the logs, and complete the setup form.

The SQLite database, app secret and setup token are stored together in the `folio_data` volume. No environment file or separate database container is required.

`latest` follows stable Folio releases. Pin an exact version such as `0.1.0` when you want upgrades to be deliberate. The `edge` tag contains the latest tested build from `main` and may be unstable.

Check the container and readiness endpoint:

```sh
docker compose ps
curl --fail http://localhost:3000/api/health/ready
```

## Deployment

The default Compose configuration binds Folio to `127.0.0.1`. Put a reverse proxy in front of that address when exposing Folio on a domain.

Use SQLite unless you already run PostgreSQL or need an externally managed database.

| | SQLite | PostgreSQL |
| --- | --- | --- |
| Best for | One Folio container on one host | An existing or externally managed database |
| Setup | One Folio container | Folio plus `compose.postgres.yaml` |
| Storage | `folio_data` Docker volume | `postgres_data` plus generated secrets in `folio_data` |

### Use PostgreSQL

Create an environment file and choose a private database password:

```sh
cp .env.example .env
```

```dotenv
POSTGRES_PASSWORD=replace-with-a-long-private-password
```

Then start both Compose files together:

```sh
docker compose -f compose.yaml -f compose.postgres.yaml up -d
docker compose -f compose.yaml -f compose.postgres.yaml logs folio
```

Keep both `-f` arguments on future `up`, `down` and `config` commands. Changing database dialect does not move existing data between engines.

### Use a domain

Point a normal reverse proxy at `http://127.0.0.1:3000` and terminate TLS there. Preserve the browser's `Host` header and have the proxy overwrite `X-Forwarded-Proto` with the actual client protocol. Folio discovers its address from those headers, so no public-URL environment variable is needed.

Keep port 3000 private when using a reverse proxy. For direct access on a private network or through a VPN such as Tailscale, change the port mapping in the minimal Compose example to `"3000:3000"`, then open `http://your-server:3000/setup`. No public URL or authentication environment variables are required; HTTP and HTTPS sessions are configured automatically.

That port mapping publishes on all host interfaces, not just the VPN. Restrict access to the intended private network, or bind to its specific host IP. Never expose an unencrypted sign-in page to the public internet. When using the repository's full Compose file, `FOLIO_BIND_ADDRESS` controls the same binding.

<details>
<summary><strong>Configuration reference</strong></summary>

<br>

The default SQLite Compose installation works without any of these settings.

| Variable | Default | Purpose |
| --- | --- | --- |
| `FOLIO_BIND_ADDRESS` | `127.0.0.1` | Host interface used by Docker Compose |
| `FOLIO_PORT` | `3000` | Host port used by Docker Compose |
| `FOLIO_DATA_DIR` | `/data` in Docker; `./data` from source | Directory for SQLite and generated secrets |
| `APP_SECRET` | generated | Optional externally managed authentication secret of at least 32 characters |
| `SETUP_TOKEN` | generated | Optional externally managed first-run token of at least 32 characters |
| `DEBUG` | `false` | Set `true` or `1` for startup, authentication and recurring-job diagnostics |
| `DEFAULT_CURRENCY` | setup selection | Optional supported currency code, such as `GBP`, to prefill setup |
| `DEFAULT_COUNTRY` | browser-detected when available | Optional supported country code, such as `GB`, to prefill setup |
| `CRON_SECRET` | unset | Optional bearer token for the external recurring-job endpoint |
| `DATABASE_DIALECT` | `sqlite` | `sqlite` or `postgres` |
| `DATABASE_URL` | `<FOLIO_DATA_DIR>/folio.sqlite` | Optional SQLite filename override or PostgreSQL connection URL |
| `DATABASE_POOL_SIZE` | `10` | PostgreSQL connection pool size |

PostgreSQL can use `DATABASE_URL` or the standard `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` and `PGDATABASE` variables used by the supplied overlay.

Country and currency defaults only prefill the business setup form. Saved drafts and your own choices take priority; changing these variables never changes an existing business. There is no locale setting because Folio currently has one interface language.

Debug logging records events, status codes, timings and aggregate counts, not passwords, app secrets, session cookies or invoice/customer details. The first-run setup token still appears in the ordinary startup log until an owner is created.

Fresh installations store `folio.sqlite`, `app-secret` and `setup-token` directly in the data directory. Generated secret files have permissions `0600`; newly created directories use `0700`. Existing mounted directories and legacy secret files retain their permissions. For example, to retrieve your generated app secret privately:

```sh
docker compose exec folio cat /data/app-secret
```

Adjust the path if you change `FOLIO_DATA_DIR`. The generated value is also available as `APP_SECRET` inside Folio's running process, but it is not written into `.env`, Compose, Docker's configured environment or a separate shell. An explicitly supplied `APP_SECRET` stays externally managed and is not copied into the secret file. Keep it private and stable across restarts.

Keep a Docker data-directory override within the mounted `/data` volume, such as `/data/folio`, or mount your chosen absolute path and make it writable by the container's `node` user. Changing the directory does not move an existing database or secrets; copy the complete data directory with Folio stopped before changing its location.

For upgrades, existing `folio.db` databases remain in place and legacy `.folio` secret files are reused without changing their values. `BETTER_AUTH_SECRET` and the old secret-only `FOLIO_CONFIG_DIR` are accepted as migration aliases; use `APP_SECRET` and `FOLIO_DATA_DIR` for new configuration. `APP_SECRET` takes precedence over its old name. When a data directory is set, an explicitly configured legacy secret directory is also checked for migration, but current secret files in the data directory take priority. `FOLIO_PUBLIC_URL` is no longer read; proxies must preserve `Host` instead.

</details>

<details>
<summary><strong>Recurring invoices</strong></summary>

<br>

Folio checks for due schedules when it starts and once an hour after that. Missed dates are processed when the container comes back online, and each scheduled occurrence can be issued only once.

No cron container or secret is required. `CRON_SECRET` only enables the optional `/api/jobs/recurring` endpoint for operators who want an external scheduler to request an extra check.

</details>

<details>
<summary><strong>Back up and update Folio</strong></summary>

<br>

For SQLite, stop Folio before copying the database and generated secrets:

```sh
docker compose stop folio
docker compose cp folio:/data ./folio-backup
docker compose start folio
```

Protect the resulting directory and test restoring it. Adjust the source path if your data directory is outside `/data`. For PostgreSQL, use `pg_dump` and retain the `folio_data` volume, or the externally managed `APP_SECRET`, alongside the database backup.

Update the container with:

```sh
docker compose pull
docker compose up -d
```

Migrations run automatically when the application starts. Take a backup before updating.

</details>

## Develop locally

Folio uses Next.js, React, TypeScript and Kysely. Bun installs dependencies; Node.js 24 runs the application and native SQLite driver.

```sh
bun install
cp .env.example .env.local
bun run dev
```

Open [http://localhost:3000/setup](http://localhost:3000/setup). When `SETUP_TOKEN` is blank, Folio prints the generated token in the terminal.

Before opening a pull request, run the complete check suite:

```sh
bun run typecheck
bun run lint
bun run test
bun run build
```

Read [CONTRIBUTING.md](./CONTRIBUTING.md) for the development workflow and [SECURITY.md](./SECURITY.md) for responsible vulnerability reporting.

## Container tags

| Tag | Contents |
| --- | --- |
| `latest` | Latest stable release |
| `0.1.0` | Exact, immutable release |
| `beta` | Latest intentional beta release |
| `0.2.0-beta.1` | Exact, immutable beta release |
| `edge` | Latest tested commit on `main` |
| `sha-<commit>` | Exact, tested commit |

## Licence

Folio is open-source software available under the [MIT licence](./LICENSE).
