# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Yuvomi Orchestrator is a multi-tenant control plane ("Access Broker") that provisions and manages one isolated Docker container + data volume per family running the Yuvomi app (Express.js + SQLite/SQLCipher, external project — its source is never modified by this repo). It is an "Instance-per-Tenant" model: each tenant gets its own container, its own subdomain, and its own encryption secrets.

npm workspaces monorepo:

- `packages/orchestrator` — Node/TypeScript/Express backend + Prisma (control-plane DB, SQLite). The control plane.
- `packages/admin-ui` — React/Vite/TypeScript/Tailwind admin console (super-admin only).
- `infra/traefik` — Traefik static + dynamic config (reverse proxy, wildcard TLS).
- `docker-compose.yml` — unifies Traefik, two `docker-socket-proxy` instances, the orchestrator, and the admin UI.

## Commands

Run from the repo root unless noted.

```bash
# install everything (npm workspaces)
npm install

# backend dev server (tsx watch)
npm run dev:orchestrator

# frontend dev server (vite)
npm run dev:admin-ui

# build both packages
npm run build

# Prisma (orchestrator's own control-plane DB, not tenant DBs)
npm run prisma:generate
npm run prisma:migrate          # deploy (prod)
cd packages/orchestrator && npm run prisma:migrate:dev   # create a migration locally

# tests (orchestrator only — admin-ui has no test suite yet)
cd packages/orchestrator && npx vitest run
cd packages/orchestrator && npx vitest run src/scheduler/runner.test.ts   # single file

# type-check
cd packages/orchestrator && npx tsc --noEmit
cd packages/admin-ui && npx tsc -b

# lint
npm run lint

# validate docker-compose.yml (needs a .env — copy .env.example first)
docker compose config
```

Vitest env vars are provided by `packages/orchestrator/vitest.setup.ts` (wired via `vitest.config.ts`) — `src/config/env.ts` validates `process.env` eagerly at import time and calls `process.exit(1)` on failure, so any new test file that transitively imports it needs those defaults already in place.

## Architecture

**Docker access is never direct.** The orchestrator never mounts `/var/run/docker.sock` — it goes through a `tecnativa/docker-socket-proxy` instance (see `docker-compose.yml`), scoped to just container lifecycle + image pull + exec (for backups), no Swarm/secrets/plugins/build. Traefik has zero Docker access at all — see below.

**Tenant lifecycle** lives in `packages/orchestrator/src/tenants/service.ts`, backed by `src/docker/tenantContainer.ts` (dockerode create/start/stop/remove) and `src/docker/traefikRoute.ts` (file-based Traefik routing, see below). `src/docker/labels.ts` now only sets bookkeeping labels — Traefik doesn't read them. Tenant secrets (`DB_ENCRYPTION_KEY`, `SESSION_SECRET`) are generated per-tenant in `src/tenants/secrets.ts` and written to a `.env` file on the tenant's host data dir (`TENANT_DATA_ROOT/<tenant-id>/.env`, mode 0600), bind-mounted read-only into the container — **not** passed via `docker create`'s `Env` array, so they never show up in `docker inspect`. This assumes the Yuvomi image loads env vars via dotenv from its working directory; see `TENANT_ENV_MOUNT_PATH`/`TENANT_DATA_MOUNT_PATH` in `.env.example` if that assumption changes.

**Docker-outside-of-Docker path parity.** The orchestrator container writes tenant data dirs via Node `fs` calls, then asks the (host) Docker daemon to bind-mount those same host paths into tenant containers. For that hand-off to resolve correctly, `docker-compose.yml` bind-mounts `TENANT_DATA_ROOT` into the orchestrator container at the *identical* path it has on the host.

**Traefik has no Docker provider and no Docker socket access at all.** The Docker Engine in this environment (29.x) raised its minimum supported API version to 1.44 and hard-rejects anything below with a 400; Traefik's vendored Docker client always probes with the old `/v1.24/version` first, with no config knob to override it — confirmed broken against `traefik:v3.1` through `v3.5.6`, both with and without a `DOCKER_API_VERSION` env var (Traefik doesn't read it). So tenant routing is file-based instead: `src/docker/traefikRoute.ts` writes/removes one YAML file per tenant into a directory shared with the Traefik container (`tenant_routes` volume), and Traefik's `file` provider (`watch: true`) picks it up live, no restart, no Docker API involved. The orchestrator's own API and the admin UI are similarly static entries in `infra/traefik/dynamic/core-services.yml` (they used to be Docker-label-discovered too); their hosts are NOT hardcoded — the files use Traefik's Go templating (`{{ env "TRAEFIK_ADMIN_HOST" }}` etc.), with the values assembled in `docker-compose.yml` from `ROOT_DOMAIN` + `ADMIN_SUBDOMAIN`/`API_SUBDOMAIN` (defaults `admin`/`api`). A single wildcard cert (`*.<ROOT_DOMAIN>`) is obtained once via a `noop@internal` bootstrap router in `infra/traefik/dynamic/wildcard-cert.yml`; every router just references `certresolver: dns-wildcard` and Traefik reuses the wildcard by SAN match. If you ever move this stack to a Docker Engine that doesn't have the raised API floor, switching back to label-based discovery is possible but not necessary — the file-based approach has no real downside and needs one fewer service (`docker-socket-proxy-traefik` was removed entirely).

**Prisma on SQLite has no enum type.** What would be enum columns (`Tenant.status`, `Invite.channel`, `Schedule.type`/`status`, `BackupLog.status`) are plain `String` columns in `prisma/schema.prisma`; the canonical value sets and TS union types live in `src/db/enums.ts`. Keep both in sync when adding a new state.

**First super-admin is auto-bootstrapped** (`src/auth/bootstrap.ts`, called at startup): with an empty `AdminUser` table the orchestrator creates `ADMIN_DEFAULT_EMAIL` (default `admin@example.com`) with a random password, printed as a plain banner to the container logs on *every* startup until changed. The generated password is deliberately stored plaintext in `AdminUser.initialPassword` for that re-printing and cleared (with `mustChangePassword`) by `POST /api/auth/password`; while `mustChangePassword` is set, `requireAuth` blocks everything outside `/api/auth/*` and the admin UI forces the `/change-password` screen. There is no seed script anymore and no public signup endpoint — other admins are created by an existing super-admin.

**Auth** (`src/auth/`): password + mandatory TOTP (`otplib`) or WebAuthn/passkey (`@simplewebauthn/server`, API shape is the v10 "flat" `registrationInfo`/`authenticator` style, not the newer nested `credential` shape — check the installed version before assuming otherwise). Sessions are opaque tokens hashed and stored in `AdminSession`, set as an httpOnly cookie — there is no JWT. WebAuthn challenges and "password verified, MFA pending" state live in in-memory `Map`s (`src/auth/webauthn.ts`, `src/auth/pendingLogin.ts`); this only works single-process — move to Redis before scaling the orchestrator to multiple replicas.

**Tenant admin bootstrap** (`src/invites/tenantAdminClient.ts`) calls an assumed HTTP endpoint on the tenant's own Yuvomi container (`/api/admin/bootstrap`, over the internal Docker network by container name) to create that family's first admin user — since Yuvomi's source is never modified, this has to be whatever first-run endpoint Yuvomi already exposes. Update the path once that's confirmed.

**Backups** (`src/backups/service.ts`) run `sqlite3 <db> ".backup '<dest>'"` inside the tenant container via `docker exec`, writing into the same bind-mounted data volume under `backups/`. Assumes the Yuvomi image ships the `sqlite3` CLI.

**Scheduler** (`src/scheduler/`): recurring jobs are registered as live `node-cron` tasks in an in-memory registry (`src/scheduler/registry.ts`) — re-loaded from the DB once at startup (`initScheduler` in `src/scheduler/cron.ts`), then kept in sync by `src/scheduler/service.ts` on create/cancel. One-off (`runAt`) schedules are picked up by a minute-tick sweep instead of a per-schedule timer.
