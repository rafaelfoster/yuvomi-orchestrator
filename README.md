# Yuvomi Orchestrator

Multi-tenant control plane ("Access Broker") that provisions and manages one isolated Docker container + data volume per family running [Yuvomi](https://github.com/ulsklyc/yuvomi) (Express.js + SQLite/SQLCipher). It's an **Instance-per-Tenant** model: each family gets its own container, its own subdomain, and its own encryption secrets — no shared database, no shared state between families.

- `packages/orchestrator` — Node/TypeScript/Express control-plane API (Prisma + SQLite for its own state).
- `packages/admin-ui` — React/Vite/TypeScript/Tailwind admin console (super-admin only).
- `infra/traefik` — Traefik reverse proxy config (wildcard TLS, file-based routing).
- `docker-compose.yml` — wires Traefik, two `docker-socket-proxy` instances, the orchestrator, and the admin UI together.

## Architecture at a glance

- **No direct Docker socket access.** The orchestrator talks to Docker only through a `tecnativa/docker-socket-proxy` instance, scoped to container lifecycle + image pull + exec (for backups). Traefik has zero Docker access at all.
- **File-based routing.** Traefik has no Docker provider — it watches a shared directory of per-tenant YAML route files instead. No restarts needed when a tenant is created, paused, or removed.
- **Secrets on disk, not in `docker inspect`.** Each tenant's `DB_ENCRYPTION_KEY` and `SESSION_SECRET` are generated once and written to a `.env` file (mode `0600`) on the tenant's own data volume, bind-mounted read-only — never passed through Docker's `Env` array.
- **One wildcard cert.** `*.<ROOT_DOMAIN>` is issued once via DNS-01 challenge and reused by every subdomain (admin console, API, and every tenant) by SAN match.

See [CLAUDE.md](CLAUDE.md) for the full architectural notes, including the reasoning behind each of these decisions.

## Prerequisites

- A Linux host with **Docker Engine** and the **Docker Compose plugin** installed.
- A domain you control, with API access at a DNS provider Traefik supports for DNS-01 challenges (this repo defaults to **Cloudflare** — see [Traefik's DNS provider list](https://doc.traefik.io/traefik/https/acme/#providers) for others).
- Ports `80` and `443` open and reachable from the internet on that host.
- Node.js 22+ and npm, only if you plan to run the orchestrator or admin UI **outside** Docker for local development.

## Getting the code

```bash
git clone https://github.com/rafaelfoster/yuvomi-orchestrator.git
cd yuvomi-orchestrator
```

## Configure your domain

1. Point two DNS records at your host: the root domain and a wildcard (or at minimum `admin.<domain>` and `api.<domain>`, plus one record per tenant subdomain you plan to create — a wildcard `*.<domain>` A/AAAA record is simplest).
2. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

3. Edit `.env`. At minimum, set:

   | Variable | Purpose |
   |---|---|
   | `ROOT_DOMAIN` | Your domain, e.g. `familyplanner.cloud` |
   | `ADMIN_SUBDOMAIN` / `API_SUBDOMAIN` | Default to `admin` / `api` — the admin console and API are served at `admin.<ROOT_DOMAIN>` and `api.<ROOT_DOMAIN>` |
   | `ACME_EMAIL` | E-mail used for the Let's Encrypt account |
   | `DNS_PROVIDER`, `CF_API_EMAIL`, `CF_DNS_API_TOKEN` | DNS-01 credentials for your provider (Cloudflare shown by default) |
   | `ORCHESTRATOR_SESSION_SECRET` | Generate your own: `openssl rand -hex 32` — **never reuse the checked-in example value** |
   | `ORCHESTRATOR_COOKIE_DOMAIN` | Same as `ROOT_DOMAIN` |
   | `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN` | Same as `ROOT_DOMAIN` / the admin console's `https://` URL — required even if you don't use passkeys, since MFA setup shares this config |
   | `TENANT_DATA_ROOT` | Host path where tenant data volumes live, e.g. `/srv/yuvomi/tenants` |
   | `ADMIN_DEFAULT_EMAIL` | E-mail for the auto-created first super-admin (default `admin@example.com`) |

   Every other variable has a working default — see the comments in `.env.example` for what each one does.

4. Create the tenant data directory on the host (must match `TENANT_DATA_ROOT`):

   ```bash
   sudo mkdir -p /srv/yuvomi/tenants
   ```

## Spin it up

```bash
docker compose up -d --build
```

This builds and starts five services: two `docker-socket-proxy` instances, Traefik, the orchestrator API, and the admin UI. First boot takes a minute or two while images build and Traefik requests the wildcard certificate.

Check everything is healthy:

```bash
docker compose ps
docker compose logs -f orchestrator
```

## Get the admin password

There's no signup form and no seed script to run by hand — the **first super-admin account is created automatically** the first time the orchestrator starts with an empty database. Watch the orchestrator logs right after `docker compose up`:

```bash
docker compose logs orchestrator | grep -A6 "default admin credentials"
```

You'll see a banner like:

```
==============================================================
  Yuvomi Orchestrator — default admin credentials

  E-mail:   admin@example.com
  Password: 8x3Kj2mZpQr9nL4vWtY1sA

  You will be required to change this password on first login.
  This banner repeats on every startup until it is changed.
==============================================================
```

- The e-mail comes from `ADMIN_DEFAULT_EMAIL` in `.env` (default `admin@example.com`).
- The password is random, generated once, and printed on **every** startup until it's changed — so if you missed it, `docker compose restart orchestrator` and check the logs again.
- Log in at `https://admin.<ROOT_DOMAIN>` with those credentials. You'll be walked through:
  1. **Mandatory TOTP setup** — scan the QR code with an authenticator app (Google Authenticator, 1Password, Aegis, etc.), or enter the text code shown below it if you can't scan.
  2. **Forced password change** — pick a new password (12+ characters) before you can reach the dashboard. This also revokes the initial session's siblings and stops the banner from reappearing in the logs.

After that, use the admin console to create additional admins, provision tenant families, and manage the fleet — there's no CLI needed for day-to-day operation.

## Local development (outside Docker)

Useful for iterating on the orchestrator or admin UI without rebuilding containers each time.

```bash
npm install

# run both dev servers together (orchestrator + admin UI, prefixed logs)
npm run dev

# or individually
npm run dev:orchestrator   # tsx watch, http://localhost:4000
npm run dev:admin-ui       # vite dev server, http://localhost:5173
```

You'll still need a `.env` at the repo root (see above) — `src/config/env.ts` validates it eagerly and exits if anything required is missing. For local-only work, `ORCHESTRATOR_DB_URL=file:../data/orchestrator.db` (SQLite) means no external database to stand up; Docker/Traefik pieces aren't required unless you're testing actual tenant provisioning.

### Database migrations

```bash
npm run prisma:generate
npm run prisma:migrate            # deploy pending migrations (what Docker runs on boot)
cd packages/orchestrator && npm run prisma:migrate:dev   # create a NEW migration locally
```

### Tests, type-checking, lint

```bash
cd packages/orchestrator && npx vitest run
cd packages/orchestrator && npx vitest run src/scheduler/runner.test.ts   # single file

cd packages/orchestrator && npx tsc --noEmit
cd packages/admin-ui && npx tsc -b

npm run lint
```

## Common operations

| Task | Where |
|---|---|
| Provision a new family | Admin console → **Famílias** → *Nova família* |
| Send an onboarding invite (email/WhatsApp) | Tenant detail page → **Convites** |
| Pause / resume / delete a tenant | Tenant detail page |
| Schedule an image update or restart (one-off or cron) | Admin console → **Agendamentos** |
| Trigger or inspect backups | Tenant detail page → **Backups** |
| Tail a tenant's live container logs | Tenant detail page → **Logs** (SSE stream) |

## Troubleshooting

- **`docker compose config` fails** — you likely haven't copied `.env.example` to `.env` yet, or a required variable is empty.
- **Orchestrator container restarts in a loop** — check `docker compose logs orchestrator`; `src/config/env.ts` validates required env vars at startup and exits immediately with a clear error if one's missing or malformed.
- **Certificate never issues** — verify `CF_DNS_API_TOKEN` (or your provider's equivalent) has DNS-edit scope for the zone, and that `ACME_EMAIL`/`DNS_PROVIDER` are set. Check `docker compose logs traefik`.
- **Lost the initial admin password before changing it** — `docker compose restart orchestrator` and re-check the logs; the banner reprints on every startup until the password is actually changed.
- **New tenant subdomain doesn't resolve** — confirm your DNS wildcard (or the specific subdomain record) actually points at the host, and that the per-tenant route file was written (see `TRAEFIK_DYNAMIC_TENANTS_DIR` in `.env.example`).

## License

No license file is currently included — treat this repository as all-rights-reserved unless the owner states otherwise.
