---
name: docker-migration-env
description: Docker, Dokploy, Backend Migration and Environment Variables Compatibility Standards
trigger: always_on
---

# Docker, Migration & Environment Engineering Standards

This rule applies to all backend features, database changes, environment variables, Dockerfiles, and deployment configs.

## 1. Zero-Downtime Docker & Dokploy Environment (.env) Standards
- **Critical Docker Entrypoint Constraint**: In `server/docker-entrypoint.sh`, execution runs with `set -e`. Any failure during container initialization (migration, seed, user creation) causes an immediate container exit / crashloop. Therefore, all initialization scripts and code must be completely resilient and error-free.
- **Never Introduce Breaking / Mandatory Env Variables**: All new configurations MUST provide safe fallback defaults (e.g. `process.env.CONFIG || 'default_value'`). Container startup MUST NOT crash if an environment variable has not yet been defined in Dokploy.
- **Safe Env Parsing**: Never use non-null assertions like `process.env.VAR!` that throw at runtime if undefined. Ensure type conversions (`Number(process.env.PORT) || 3001`, `process.env.ENABLE_X === 'true'`) handle missing values gracefully.
- **Client Build-time vs Runtime Envs**: Ensure Next.js builds (`client/Dockerfile`) succeed even if `NEXT_PUBLIC_*` variables are unset during build time by always providing fallbacks in code (`process.env.NEXT_PUBLIC_API_URL || ''`).
- **Maintain Dokploy Stack Compatibility**: Preserve `docker-compose.dokploy.yml`, `server/docker-entrypoint.sh`, and Dockerfiles. Respect the network alias overrides (`POSTGRES_HOST_OVERRIDE`, `REDIS_HOST_OVERRIDE`) and healthcheck definitions.
- **Document in `.env.example`**: Any new optional configuration must be clearly documented with explanatory comments in `.env.example`.

## 2. Idempotent & Self-Healing Database Migrations
- **Strict Idempotency**: Every DDL operation in `server/src/db/migrate.ts` and raw SQL MUST use `IF NOT EXISTS` / `IF EXISTS` (e.g. `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`). Re-running migration scripts must always exit cleanly with code 0.
- **Seed Script Idempotency**: `migrate-seed.ts` and `seed-users.ts` must use `ON CONFLICT DO NOTHING` or idempotent upserts so that re-running them never triggers unique constraint or primary key errors.
- **Self-Healing Table Creation**: For critical runtime tables (such as `doctor_leaves`), provide a lightweight self-healing initialization function (e.g., `ensureTable()`) on server startup so the application remains functional even if a migration step was delayed or bypassed.
- **Data Safety & Backward Compatibility**: Never execute destructive `DROP COLUMN` or schema breaking changes that cause existing queries to fail. Preserve foreign key constraints and transactional integrity.

## 3. Mandatory Pre-Deployment Verification (Checklist)
- Always test migrations and seeds before committing:
  - `bun run server/src/db/migrate.ts` -> Must succeed with Exit code 0
  - `bun run server/src/scripts/migrate-seed.ts` -> Must succeed with Exit code 0
  - `bun run server/src/scripts/seed-users.ts` -> Must succeed with Exit code 0
- Always run TypeScript compile checks for both backend and frontend:
  - `cd server && bun x tsc --noEmit` -> Must have 0 errors
  - `cd client && bun x tsc --noEmit` -> Must have 0 errors
