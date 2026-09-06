# Contributing to Folio

Keep changes focused, explain the user-facing problem they solve, and verify them in proportion to the risk.

## Development setup

You need Bun 1.3 or later and Node.js 24.

```sh
bun install
cp .env.example .env.local
bun run dev
```

Folio creates a local SQLite database in `data/`. On a fresh database, the terminal prints the token required at `http://localhost:3000/setup`.

## Before opening a pull request

Run:

```sh
bun run typecheck
bun run lint
bun run test
bun run build
```

For UI changes, check the affected flow in light and dark mode at desktop and narrow viewport widths. Include before/after screenshots when appearance changes.

For database changes, add a forward-only migration and verify both SQLite and PostgreSQL behaviour. The normal test run exercises SQLite. Set `TEST_POSTGRES_DATABASE_URL` to a dedicated PostgreSQL test database to run the same migration contract in an isolated temporary schema. Never rewrite a migration that may already have been deployed.

## Pull requests

- Keep each pull request to one coherent change.
- Add tests for behavioural changes and regressions.
- Document new environment variables in `.env.example` and `README.md`.
- Do not include local databases, secrets, generated PDFs or customer data.
- Use British English for user-facing copy and documentation.

By participating, you agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).
