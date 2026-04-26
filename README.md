# Affiliate Engine — Shopify Affiliate & Commission MVP

A production-oriented affiliate marketing app for Shopify. Merchants create affiliate campaigns, share referral links, and the system automatically tracks clicks, records conversions, calculates commissions, and bills the merchant via Shopify's native Usage-Based Billing API — all from an embedded admin dashboard.

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Architecture Overview](#architecture-overview)
4. [Tracking & Billing Flow](#tracking--billing-flow)
5. [Revenue Model](#revenue-model)
6. [Project Structure](#project-structure)
7. [Database Schema](#database-schema)
8. [API Reference](#api-reference)
9. [Setup & Installation](#setup--installation)
10. [Environment Variables](#environment-variables)
11. [Web Pixel Configuration](#web-pixel-configuration)
12. [Architecture Decisions](#architecture-decisions)
13. [Database Architecture & Scalability](#database-architecture--scalability)
14. [DevOps & Infrastructure](#devops--infrastructure)
15. [CI/CD Pipeline](#cicd-pipeline)
16. [Deployment Strategy](#deployment-strategy)
17. [Security & Validations](#security--validations)
18. [GraphQL Rate Limit Handling](#graphql-rate-limit-handling)

---

## Features

### Admin Dashboard
- Live overview: total affiliates, clicks, conversions, revenue, and commissions
- Create affiliates with custom code, name, and commission rate (1–100%)
- Per-affiliate stats with revenue and commission breakdown
- Toggle active/inactive and hard delete with cascade

### Storefront Tracking (Web Pixel Extension)
- Captures `?ref=CODE` on any storefront page visit
- Persists attribution in a 30-day cookie + sessionStorage
- Anti-duplication: one click per session per affiliate

### Conversion Tracking
- `checkout_completed` Web Pixel event → POST to `/api/conversion`
- Commission calculation: **5% app fee** + affiliate's configured rate
- Idempotency enforced via unique `orderId` constraint

### Billing (Shopify Usage-Based API)
- On first admin access: merchant approves a Capped Amount subscription ($100 USD/month)
- On every conversion: a `UsageRecord` is created via Shopify's `appUsageRecordCreate` mutation
- Usage records use idempotency keys to prevent double-charging
- Subscription line item ID is cached in `AppBilling` table to avoid redundant API calls

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Router v7 |
| Language | TypeScript |
| Frontend | Polaris Web Components + App Bridge |
| Database | Prisma ORM + SQLite (dev) / PostgreSQL (prod) |
| Shopify Integration | `@shopify/shopify-app-react-router` |
| Billing | Shopify App Subscriptions — Usage Charges API |
| Storefront | Web Pixel Extension v2 |
| Build | Vite 6 |
| Runtime | Node.js ≥ 20 |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     SHOPIFY STOREFRONT                       │
│                                                              │
│  Customer visits /?ref=JOHN2026                              │
│       │                                                      │
│       ▼                                                      │
│  ┌──────────────────────────────────┐                        │
│  │  Web Pixel Extension (sandbox)   │                        │
│  │                                  │                        │
│  │  page_viewed ──► capture ?ref    │                        │
│  │                  cookie (30d)    │                        │
│  │                  POST /api/click │                        │
│  │                                  │                        │
│  │  checkout_completed              │                        │
│  │      ──► read cookie             │                        │
│  │          POST /api/conversion    │                        │
│  └──────────────────────────────────┘                        │
└──────────────────────────────────────────────────────────────┘
                          │ HTTPS + CORS
                          ▼
┌──────────────────────────────────────────────────────────────┐
│                   AFFILIATE ENGINE APP                       │
│                                                              │
│  POST /api/click                                             │
│    ├─ Lookup affiliate by code (normalized UPPERCASE)        │
│    ├─ Guard: isActive check                                  │
│    ├─ Anti-spam (10s cooldown per affiliate)                 │
│    └─ INSERT Click record                                    │
│                                                              │
│  POST /api/conversion                                        │
│    ├─ Lookup affiliate                                       │
│    ├─ Idempotency check (orderId UNIQUE)                     │
│    ├─ Calculate: appFee = total × 5%                         │
│    ├─ Calculate: commission = total × rate%                  │
│    ├─ INSERT Conversion record                               │
│    └─ Fire-and-forget: appUsageRecordCreate (Shopify API)    │
│                                                              │
│  /app (Admin — requires merchant billing subscription)       │
│    ├─ billing.check() on every request                       │
│    ├─ billing.request() → Shopify confirmation → return      │
│    └─ Affiliate CRUD + live stats                            │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│              SQLite / PostgreSQL (production)                │
│                                                              │
│  Session │ Affiliate │ Click │ Conversion │ AppBilling       │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼ GraphQL (retries + backoff)
┌──────────────────────────────────────────────────────────────┐
│                   SHOPIFY ADMIN API                          │
│  appSubscriptionCreate  ·  appUsageRecordCreate              │
└──────────────────────────────────────────────────────────────┘
```

---

## Tracking & Billing Flow

```
1. Merchant installs app
   └─ billing.check() detects no active subscription
   └─ billing.request() redirects to Shopify billing page
   └─ Merchant approves Capped Amount plan ($100/month)
   └─ Shopify redirects back to /app

2. Merchant creates affiliate
   └─ code: JOHN2026 | rate: 15% | status: Active

3. Affiliate shares link
   └─ https://store.myshopify.com/?ref=JOHN2026

4. Customer clicks link
   └─ Web Pixel: page_viewed → captures ?ref=JOHN2026
   └─ Stores in cookie (30 days) + sessionStorage
   └─ POST /api/click → Click record saved

5. Customer completes checkout ($200 order)
   └─ Web Pixel: checkout_completed → reads cookie
   └─ POST /api/conversion
       ├─ Conversion record saved
       │     totalAmount: $200
       │     commissionApp: $10 (5%)
       │     commissionAffiliate: $30 (15%)
       └─ [async] appUsageRecordCreate → $10 usage charge billed

6. Dashboard shows updated stats in real time
```

---

## Revenue Model

| Party | Rate | Example ($200 order) |
|---|---|---|
| App service fee | 5% of order total | $10.00 |
| Affiliate commission | Merchant-defined per affiliate | $30.00 (at 15%) |

The app fee is billed to the merchant via Shopify's Usage Charges API. The affiliate commission is tracked in the DB for the merchant to pay out through their own process.

---

## Project Structure

```
affiliate-engine/
├── app/
│   ├── routes/
│   │   ├── app._index.tsx        # Dashboard (stats, CRUD, toggle, delete)
│   │   ├── app.tsx               # App shell — billing gate on every request
│   │   ├── api.click.ts          # Click tracking (CORS, anti-spam)
│   │   ├── api.conversion.ts     # Conversion + usage charge creation
│   │   ├── auth.login/           # Shopify OAuth UI
│   │   ├── auth.$.tsx            # OAuth callback handler
│   │   ├── webhooks.app.uninstalled.tsx
│   │   └── webhooks.app.scopes_update.tsx
│   ├── services/
│   │   ├── affiliate.service.ts  # Affiliate CRUD
│   │   └── billing.service.ts    # Usage charges + subscription cache
│   ├── utils/
│   │   ├── useAffiliateRef.ts    # Client-side ref capture hook
│   │   ├── referral.server.ts
│   │   └── referral-cookie.server.ts
│   ├── db.server.ts              # Prisma singleton
│   ├── shopify.server.ts         # Shopify config + billing plan definition
│   └── root.tsx
├── extensions/
│   └── affiliate-pixel-v2/
│       └── src/index.ts          # page_viewed + checkout_completed
├── prisma/
│   ├── schema.prisma             # 5 models including AppBilling
│   ├── seed.ts
│   └── migrations/
└── shopify.app.toml
```

---

## Database Schema

### `Affiliate`
| Column | Type | Notes |
|---|---|---|
| `id` | CUID | PK |
| `code` | String UNIQUE | Always uppercase |
| `name` | String? | Display name |
| `commissionRate` | Float | Percentage (e.g. 15.0) |
| `isActive` | Boolean | Soft-pause without data loss |

### `Click`
| Column | Type | Notes |
|---|---|---|
| `affiliateId` | FK | Index |
| `refCode` | String | Index — supports case-normalized lookups |
| `shop` | String? | Source store domain |
| `userAgent` | String? | Browser info |

### `Conversion`
| Column | Type | Notes |
|---|---|---|
| `orderId` | String UNIQUE | Idempotency key |
| `refCode` | String? | Attribution at time of checkout |
| `totalAmount` | Float | Order total |
| `commissionApp` | Float | 5% fee charged to merchant |
| `commissionAffiliate` | Float | Amount owed to affiliate |
| `billingChargeId` | String? | Shopify `AppUsageRecord` GID (null = pending/failed) |

### `AppBilling`
| Column | Type | Notes |
|---|---|---|
| `shop` | String UNIQUE | One record per installed shop |
| `subscriptionId` | String | Shopify `AppSubscription` GID |
| `subscriptionLineItemId` | String | Used in `appUsageRecordCreate` calls |
| `status` | String | ACTIVE \| CANCELLED \| EXPIRED |
| `cappedAmount` | Float | Current cap ($100 default) |

---

## API Reference

### `POST /api/click`

```json
{ "ref": "JOHN2026", "shop": "mystore.myshopify.com", "userAgent": "..." }
```

**Responses:**
```json
{ "ok": true, "affiliateId": "cuid" }
{ "ok": true, "skipped": true }
{ "ok": false, "error": "Affiliate not found" }
```

Rules: ref normalized to uppercase, inactive affiliates return 404, 10-second cooldown per affiliate.

---

### `POST /api/conversion`

```json
{
  "ref": "JOHN2026",
  "shop": "mystore.myshopify.com",
  "orderId": "gid://shopify/Order/123",
  "totalPrice": "200.00",
  "currency": "USD"
}
```

**Responses:**
```json
{ "ok": true, "conversionId": "cuid" }
{ "ok": true, "skipped": true }
{ "ok": false, "error": "Affiliate not found" }
```

Both endpoints return `Access-Control-Allow-Origin: *` headers and handle `OPTIONS` preflight.

---

## Setup & Installation

### Prerequisites
- Node.js `>= 20.19`
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli) authenticated
- Shopify Partner account + development store

### 1. Clone and install
```bash
git clone https://github.com/<your-username>/affiliate-engine
cd affiliate-engine
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env — see Environment Variables section
```

### 3. Initialize database
```bash
npm run setup
# runs: prisma generate && prisma migrate deploy
```

### 4. Seed test data (optional)
```bash
npx prisma db seed
# Creates TEST123 (10%), JOHN2026 (15%), INFLUENCER1 (20%)
```

### 5. Start development
```bash
npm run dev
# Press P to open the app URL
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SHOPIFY_API_KEY` | ✅ | App API key from Partner Dashboard |
| `SHOPIFY_API_SECRET` | ✅ | App secret |
| `SHOPIFY_APP_URL` | ✅ | Public URL (Cloudflare tunnel in dev) |
| `SCOPES` | ✅ | Comma-separated OAuth scopes |
| `DATABASE_URL` | No | Prisma DB URL (defaults to `file:dev.sqlite`) |
| `SHOP_CUSTOM_DOMAIN` | No | Custom shop domain |
| `NODE_ENV` | No | `production` disables billing test mode |

---

## Web Pixel Configuration

1. Shopify Admin → **Settings → Customer events**
2. Find **affiliate-pixel-v2** → **Configure**
3. Set **App URL** to your tunnel/production URL (e.g. `https://your-app.trycloudflare.com`)
4. Save

> The App URL field (stored as `accountID` in the extension config) tells the pixel where to POST click and conversion events. Update it each time the Cloudflare tunnel URL changes.

---

## Architecture Decisions

### Why React Router v7?
Shopify's current recommended framework for embedded apps. Its file-based routing, SSR support, and first-class Shopify integration via `@shopify/shopify-app-react-router` reduce boilerplate significantly. Remix and React Router v7 are converging, so skills transfer directly.

**Alternative considered:** Next.js App Router. Discarded because Shopify's official adapter is React Router; using Next.js would require maintaining a custom OAuth/session layer.

### Why Prisma + SQLite for the MVP?
SQLite requires zero infrastructure — no database server to provision or configure. Prisma provides type-safe queries and a migration system. The schema is identical for PostgreSQL; swapping the database is a one-line change in `schema.prisma` plus updating `DATABASE_URL`.

**Production migration path:** Change `provider = "sqlite"` to `provider = "postgresql"`, update `DATABASE_URL` to a managed Postgres instance (Supabase, Neon, Railway), run `prisma migrate deploy`.

### Why Web Pixel over ScriptTags?
ScriptTags are legacy and deprecated by Shopify. Web Pixels run in a sandboxed iframe with controlled APIs, are compliant with browser privacy requirements, and have official first-class support for `checkout_completed` events. They cannot be blocked by ad blockers in the same way external scripts can.

### Idempotency in conversions
The `orderId` field has a `UNIQUE` constraint. Before inserting a conversion, the endpoint checks for an existing record with the same `orderId` and returns `{ skipped: true }` if found. This guarantees that a retried pixel event or a duplicate API call never creates double charges.

```typescript
const existing = await prisma.conversion.findUnique({ where: { orderId } });
if (existing) return Response.json({ ok: true, skipped: true }, ...);
```

### Asynchronous billing (fire-and-forget)
The `appUsageRecordCreate` Shopify API call is made asynchronously **after** the conversion record is saved. This ensures the pixel receives a fast response without being blocked by Shopify API latency (which can spike to 500ms+). The `billingChargeId` field in `Conversion` is updated once the async call resolves. A `null` value indicates a pending or failed charge that can be retried.

For production with high volume, this would move to a message queue (BullMQ, SQS) to guarantee delivery.

### Billing subscription caching (AppBilling table)
Querying `currentAppInstallation.activeSubscriptions` on every conversion is expensive. The `AppBilling` table caches the `subscriptionLineItemId` per shop so the Shopify API is only called once per installation (or after a status change). The cache is invalidated when the subscription status changes.

---

## Database Architecture & Scalability

### Current schema justification

**Indexes:**
- `Click(affiliateId)` — dashboard stats query (JOIN with affiliate)
- `Click(refCode)` — lookup by code in tracking flow
- `Conversion(affiliateId)`, `Conversion(orderId)`, `Conversion(refCode)` — stats aggregation and idempotency check
- `AppBilling(shop)` — unique lookup per tenant

**Idempotency:** `Conversion.orderId` has a `UNIQUE` constraint enforced at the DB level — even if two concurrent requests arrive for the same order, only one will succeed.

### Migrating to production (PostgreSQL)

```diff
- provider = "sqlite"
+ provider = "postgresql"
```

Additional changes for scale:
1. **Connection pooling** — Add PgBouncer or use a pooler like Supabase's built-in one. SQLite is single-writer; PostgreSQL with pooling handles thousands of concurrent connections.
2. **Row-level partitioning** — Partition `Click` and `Conversion` tables by `shop` (tenant) for multi-tenant isolation, and by `createdAt` month for archival:
   ```sql
   PARTITION BY LIST (shop)
   ```
3. **Read replicas** — Route dashboard/stats queries (`SELECT ... COUNT(*)`) to a read replica. Write operations (INSERT click/conversion) go to the primary.
4. **Indexing strategy** — Add composite indexes for the most common dashboard query pattern:
   ```sql
   CREATE INDEX idx_conversion_shop_created ON "Conversion"(shop, "createdAt" DESC);
   CREATE INDEX idx_click_shop_created ON "Click"(shop, "createdAt" DESC);
   ```

### Handling millions of tracking events (Black Friday)

At scale (1,000+ stores, thousands of events/minute):

| Concern | Solution |
|---|---|
| Write throughput | Async write queue (BullMQ) — buffer clicks and batch-insert |
| Read latency | Materialized views for per-affiliate stats, refreshed every minute |
| DB connections | PgBouncer in transaction mode — pool of 20 connections serves thousands of app instances |
| Hot rows | Avoid `SELECT ... FOR UPDATE` on the affiliate row; use optimistic inserts |
| Data volume | Archive `Click` records older than 90 days to cold storage (S3 + Athena) |

**MongoDB as an alternative for event data:**  
If tracking event volume is the primary concern (hundreds of millions of click/conversion documents), MongoDB with sharding by `shop` domain and TTL indexes for automatic archival would outperform PostgreSQL for append-heavy workloads. However, PostgreSQL with proper indexing handles up to ~100M rows efficiently, which covers most Shopify app scenarios before needing a dedicated event store.

### Data consistency between Pixel event and billing charge

The conversion record is saved **first** (synchronous, within the HTTP handler). The usage charge is created **after** (asynchronous). If the charge fails:
- The conversion is not lost
- `billingChargeId` remains `null` — this is a signal for a retry job
- A scheduled job can query `Conversion WHERE billingChargeId IS NULL AND createdAt < NOW() - 5m` and retry the charge

This two-phase approach (persist-then-charge) ensures no revenue data is lost due to transient Shopify API failures.

---

## DevOps & Infrastructure

### Environment lifecycle

| Environment | Infrastructure | Database | Shopify App |
|---|---|---|---|
| **Development** | `npm run dev` + Cloudflare tunnel | SQLite local | Partner Dashboard sandbox app |
| **Staging** | Fly.io (single instance) | Postgres (Fly managed) | Separate Partner Dashboard app — test store |
| **Production** | Fly.io (2+ instances, health checks) | Postgres (managed, daily backups) | Published app in Partner Dashboard |

**Environment isolation in Partner Dashboard:**
- One Shopify app per environment (dev / staging / prod) — each has its own `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET`
- Environment variables managed via `fly secrets set` — never committed to git
- `shopify.app.toml` points to the current environment's `application_url`

**Secret rotation:**
- Rotate `SHOPIFY_API_SECRET` in Partner Dashboard → update in `fly secrets set SHOPIFY_API_SECRET=<new>`
- No downtime required — Shopify supports graceful key rotation
- Database credentials rotated via `fly postgres connect` + role rotation, then `fly secrets set DATABASE_URL=<new>`

### Health checks

Add a `/health` endpoint for load balancer checks:

```typescript
// app/routes/health.ts
export const loader = async () => {
  await prisma.$queryRaw`SELECT 1`;
  return Response.json({ status: "ok", ts: Date.now() });
};
```

Fly.io configuration:
```toml
[[services.http_checks]]
  path = "/health"
  interval = "10s"
  timeout = "5s"
```

### Monitoring
- **Shopify Partner Dashboard** — app install/uninstall events, billing status
- **Fly.io metrics** — CPU, memory, request latency
- **Structured logging** — all billing and conversion events use `console.error`/`console.warn` with `[billing]`/`[conversion]` prefixes for log aggregation (Datadog, Logtail)

---

## CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck          # TypeScript strict check
      - run: npm run lint               # ESLint
      - run: npx prisma validate        # Schema validation
      - run: npm run build              # Vite production build

  deploy:
    needs: validate
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
      - name: Run migrations
        run: flyctl ssh console -C "npm run setup"
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

**What each step protects:**
- `typecheck` — catches type regressions before they hit production
- `lint` — enforces code style and catches common bugs (unused vars, missing deps)
- `prisma validate` — ensures schema and migration files are in sync
- `build` — confirms the Vite + React Router build succeeds end-to-end
- `deploy` — pushes Docker image; Fly.io runs health checks before routing traffic

---

## Deployment Strategy

### Docker

The included `Dockerfile` builds a production image:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci --omit=dev
RUN npm run build
CMD ["npm", "run", "docker-start"]
```

`npm run docker-start` runs `prisma migrate deploy && react-router-serve`.

### Fly.io (recommended)

```bash
fly launch                                    # one-time setup
fly postgres create                           # managed Postgres
fly secrets set SHOPIFY_API_KEY=...          # env vars
fly secrets set SHOPIFY_API_SECRET=...
fly secrets set SHOPIFY_APP_URL=https://your-app.fly.dev
fly deploy
```

### Environment variables — never committed

All secrets live in the platform's secrets manager:
- **Development:** `.env` file (in `.gitignore`)
- **Staging/Production:** `fly secrets set` / GitHub Actions Secrets
- **Rotation:** Update in platform → restart instances → old value never exposed

### Database for production

Change `schema.prisma`:
```diff
datasource db {
-  provider = "sqlite"
-  url      = "file:dev.sqlite"
+  provider = "postgresql"
+  url      = env("DATABASE_URL")
}
```

Then run on deploy:
```bash
npx prisma migrate deploy
```

---

## Security & Validations

### Input sanitization
- `ref` codes normalized to uppercase and stripped of whitespace before DB lookup
- All API inputs are typed — `String(value)` and `Number(value)` coerce before use
- `orderId` stored as string — prevents numeric overflow edge cases

### Shopify HMAC validation
Webhooks (`app/uninstalled`, `scopes_update`) go through `authenticate.webhook(request)` which validates the HMAC signature automatically. Invalid signatures throw a 401 before any handler logic runs.

### CORS policy
The tracking endpoints (`/api/click`, `/api/conversion`) return `Access-Control-Allow-Origin: *` because they need to accept calls from any Shopify storefront domain. This is intentional — the endpoints are public-facing by design, and authorization is via the affiliate code lookup, not origin validation.

### Billing idempotency keys
`appUsageRecordCreate` is called with `idempotencyKey: "conv-{orderId}"`. This means Shopify deduplicates the charge if the same key is sent twice (e.g. due to a retry). This prevents double-billing on network errors or app restarts.

---

## GraphQL Rate Limit Handling

Shopify's Admin GraphQL API uses a **leaky bucket** algorithm: 1,000 points/bucket, refilling at 50 points/second. A simple query costs ~1 point; a mutation with many fields costs more.

### Implementation: Exponential backoff with jitter

```typescript
// app/services/billing.service.ts
async function withRetry<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    const throttled =
      err?.response?.status === 429 ||
      err?.message?.includes("THROTTLED") ||
      err?.errors?.some((e: any) => e?.extensions?.code === "THROTTLED");

    if (throttled && attempt < MAX_RETRIES) {
      // Full jitter prevents thundering herd on burst failures
      const delay = BASE_DELAY_MS * 2 ** attempt + Math.random() * 200;
      await new Promise((res) => setTimeout(res, delay));
      return withRetry(fn, attempt + 1);
    }
    throw err;
  }
}
```

**Retry schedule (BASE_DELAY = 500ms, MAX_RETRIES = 3):**

| Attempt | Delay |
|---|---|
| 1 | ~500ms + jitter |
| 2 | ~1000ms + jitter |
| 3 | ~2000ms + jitter |

### For high-volume production

When processing thousands of conversions/minute, this approach isn't sufficient. The production architecture would use:

1. **BullMQ queue** — all billing jobs go to a Redis-backed queue
2. **Rate-aware worker** — reads the `X-Shopify-Shop-Api-Call-Limit` response header and self-throttles
3. **Dead letter queue** — failed jobs after 3 retries are parked for manual review

```
Conversion event → INSERT to DB → enqueue billing job
                                        │
                                  BullMQ Worker
                                  (respects rate limit)
                                        │
                                  appUsageRecordCreate
                                        │
                            Update Conversion.billingChargeId
```

This decouples the pixel response latency from billing API latency entirely.

---

## Author

**Leonardo Guacaran**  
Built for the Converxity technical evaluation — April 2026.
