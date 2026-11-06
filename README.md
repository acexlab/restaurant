# Xeva Restaurant OS

A multi-tenant, modular restaurant SaaS, launching first in Kerala. One shared platform hosts
independently licensable modules (Token, QR Menu, Ordering, Kitchen, POS, …) that connect
through an integration engine.

**Current stage: Phase 0, core platform foundation.** See
[documentation/architecture/core-platform-blueprint.md](documentation/architecture/core-platform-blueprint.md).

## Requirements

- Node.js 22+, pnpm 10+
- Docker Desktop (for PostgreSQL)

## Getting started

```bash
pnpm install
cp backend/api/.env.example backend/api/.env
pnpm db:up          # start PostgreSQL on localhost:5433
pnpm --filter @xeva/contracts build
pnpm db:migrate     # apply schema + Row Level Security policies
pnpm db:seed        # Xeva admin + two test restaurants in Kerala
pnpm dev            # API on http://localhost:4000/api/v1
```

In two more terminals, start the admin portals (they proxy `/api/v1` to the API):

```bash
pnpm --filter @xeva/restaurant-admin dev   # http://localhost:3001
pnpm --filter @xeva/super-admin dev        # http://localhost:3002
pnpm --filter @xeva/customer-pwa dev       # http://localhost:3010 (queue TV display, join, token tracking)
```

The development test accounts are listed at the top of [backend/api/prisma/seed.ts](backend/api/prisma/seed.ts).

```bash
pnpm test           # Phase 0 exit tests (needs the database running)
```

## Layout

```
packages/contracts     Module catalogue, event contracts, permissions, default roles
backend/api            NestJS modular monolith
  src/core             Tenants, identity, tenancy guard, audit
  src/module-registry  Activation lifecycle, feature flags, navigation
  src/integration-engine  Outbox, dispatcher, integrations, replay
  prisma               Schema, migrations (incl. RLS), seed
database/policies      Database role setup
documentation          Architecture docs
packages/ui           Shared React components, session + API client (used by the apps)
apps/restaurant-admin  Restaurant Admin portal — http://localhost:3001
apps/xeva-super-admin  Xeva Super Admin portal — http://localhost:3002
apps/customer-pwa      Public customer pages — http://localhost:3010
backend/api/src/modules/digital-token   M01 Digital Token (first standalone product)
```
