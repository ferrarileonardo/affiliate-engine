# Affiliate Engine — Shopify Affiliate App MVP

A fully functional affiliate marketing application built for Shopify. Merchants can create affiliate codes, distribute unique referral links, and automatically track clicks and sales commissions — all from an embedded admin dashboard.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Tracking Flow](#tracking-flow)
- [Revenue Model](#revenue-model)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Setup & Installation](#setup--installation)
- [Environment Variables](#environment-variables)
- [Web Pixel Configuration](#web-pixel-configuration)
- [Running Locally](#running-locally)
- [Seed Data](#seed-data)

---

## Features

### Admin Dashboard (`/app`)

- **Overview stats** — total affiliates, clicks, conversions, revenue, and commissions at a glance
- **Create affiliates** — assign a unique code, name, and custom commission rate (1–100%)
- **Per-affiliate stats** — clicks, conversions, total revenue attributed, and commission earned
- **Toggle active/inactive** — pause an affiliate without losing their historical data
- **Delete affiliate** — removes the affiliate and all associated click/conversion records
- **Referral link preview** — displays the `?ref=CODE` URL directly in the table

### Storefront Tracking (Web Pixel Extension)

- **Click tracking** — captures `?ref=CODE` from the URL on any storefront page and records the visit
- **Anti-duplication** — click is only recorded once per browser session
- **Cookie persistence** — referral attribution stored in cookie (30-day expiry) and sessionStorage so conversions are attributed even if the customer navigates away
- **Conversion tracking** — listens to the `checkout_completed` event and automatically records the sale with full commission calculation

### API Endpoints

- `POST /api/click` — records a referral click
- `POST /api/conversion` — records a completed sale and calculates commissions
- Both endpoints support CORS so they can be called from the Shopify storefront context

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Router v7 (Shopify App Template) |
| Language | TypeScript |
| Database | Prisma ORM + SQLite |
| Shopify Integration | `@shopify/shopify-app-react-router` |
| Admin UI | Shopify Polaris Web Components |
| Storefront Tracking | Shopify Web Pixel Extension v2 |
| Session Storage | `@shopify/shopify-app-session-storage-prisma` |
| Build Tool | Vite |
| Runtime | Node.js ≥ 20 |

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    SHOPIFY STOREFRONT                    │
│                                                          │
│  Customer visits /?ref=JOHN2026                          │
│       │                                                  │
│       ▼                                                  │
│  ┌─────────────────────────────────┐                     │
│  │   Web Pixel Extension (iframe)  │                     │
│  │   affiliate-pixel-v2            │                     │
│  │                                 │                     │
│  │  page_viewed ──► capture ?ref   │                     │
│  │                  save cookie    │                     │
│  │                  POST /api/click│                     │
│  │                                 │                     │
│  │  checkout_completed             │                     │
│  │          ──► read cookie        │                     │
│  │              POST /api/conversion                     │
│  └─────────────────────────────────┘                     │
└──────────────────────────────────────────────────────────┘
                          │
                          │ HTTP (CORS-enabled)
                          ▼
┌──────────────────────────────────────────────────────────┐
│                   AFFILIATE ENGINE APP                   │
│                                                          │
│  POST /api/click                                         │
│    ├─ Lookup affiliate by code                           │
│    ├─ Anti-spam (10s cooldown)                           │
│    └─ INSERT Click record                                │
│                                                          │
│  POST /api/conversion                                    │
│    ├─ Lookup affiliate by code                           │
│    ├─ Idempotency check (orderId unique)                 │
│    ├─ Calculate: appFee = total × 5%                     │
│    ├─ Calculate: commission = total × rate%              │
│    └─ INSERT Conversion record                           │
│                                                          │
│  /app (Admin Dashboard)                                  │
│    ├─ Authenticate via Shopify OAuth                     │
│    ├─ CRUD affiliates                                    │
│    └─ Aggregate stats per affiliate                      │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│                      SQLite DATABASE                     │
│                                                          │
│   Session  │  Affiliate  │  Click  │  Conversion        │
└──────────────────────────────────────────────────────────┘
```

---

## Tracking Flow

```
1. Merchant creates affiliate in admin panel
   → code: JOHN2026 | rate: 15% | status: Active

2. Affiliate shares link
   → https://mystore.myshopify.com/?ref=JOHN2026

3. Customer clicks the link
   → Web Pixel captures ?ref=JOHN2026
   → Saves to cookie (30 days) + sessionStorage
   → POST /api/click  →  Click record saved in DB

4. Customer browses, adds to cart, checks out
   → checkout_completed event fires in Web Pixel
   → Reads affiliate_ref from cookie/sessionStorage
   → POST /api/conversion

5. Conversion is recorded
   → orderId, shop, refCode, totalAmount
   → commissionApp     = $100.00 × 5%  = $5.00
   → commissionAffiliate = $100.00 × 15% = $15.00

6. Admin dashboard reflects updated stats in real time
```

---

## Revenue Model

Every recorded sale splits into two commissions:

| Party | Calculation | Example (on $100 order) |
|---|---|---|
| App fee | `totalAmount × 5%` | $5.00 |
| Affiliate commission | `totalAmount × commissionRate%` | $15.00 (at 15%) |

Both values are stored per conversion in the `Conversion` table, giving the merchant full visibility into payables.

---

## Project Structure

```
affiliate-engine/
├── app/
│   ├── routes/
│   │   ├── app._index.tsx          # Admin dashboard (stats + CRUD)
│   │   ├── app.tsx                 # App shell & navigation
│   │   ├── api.click.ts            # Click tracking endpoint
│   │   ├── api.conversion.ts       # Conversion tracking endpoint
│   │   ├── auth.login/             # Shopify OAuth login
│   │   ├── auth.$.tsx              # OAuth callback handler
│   │   ├── webhooks.app.uninstalled.tsx
│   │   └── webhooks.app.scopes_update.tsx
│   ├── services/
│   │   └── affiliate.service.ts    # Affiliate CRUD operations
│   ├── utils/
│   │   ├── useAffiliateRef.ts      # Client-side ref capture hook
│   │   ├── referral.server.ts      # Server-side ref resolution
│   │   └── referral-cookie.server.ts
│   ├── types/
│   │   └── affiliate.ts            # TypeScript interface
│   ├── db.server.ts                # Prisma singleton (dev)
│   ├── db/prisma.ts                # Prisma singleton (prod)
│   ├── shopify.server.ts           # Shopify app configuration
│   ├── root.tsx                    # HTML root with AppProvider
│   └── entry.server.tsx            # SSR entry point
├── extensions/
│   └── affiliate-pixel-v2/
│       ├── src/index.ts            # Web Pixel: page_viewed + checkout_completed
│       └── shopify.extension.toml
├── prisma/
│   ├── schema.prisma               # Database models
│   ├── seed.ts                     # Test data
│   └── migrations/
├── shopify.app.toml                # Shopify app configuration
├── vite.config.ts
├── Dockerfile
└── package.json
```

---

## Database Schema

### `Affiliate`
| Column | Type | Description |
|---|---|---|
| `id` | String (CUID) | Primary key |
| `code` | String (UNIQUE) | Referral code, always uppercase |
| `name` | String? | Display name |
| `commissionRate` | Float | Commission percentage (e.g. 15.0) |
| `isActive` | Boolean | Whether the affiliate is active |
| `createdAt` / `updatedAt` | DateTime | Timestamps |

### `Click`
| Column | Type | Description |
|---|---|---|
| `id` | String (CUID) | Primary key |
| `affiliateId` | String (FK) | Related affiliate |
| `refCode` | String | Code used at time of click |
| `shop` | String? | Store domain |
| `ip` | String? | Visitor IP (reserved) |
| `userAgent` | String? | Browser user agent |
| `createdAt` | DateTime | Click timestamp |

### `Conversion`
| Column | Type | Description |
|---|---|---|
| `id` | String (CUID) | Primary key |
| `orderId` | String (UNIQUE) | Shopify order ID — prevents double-counting |
| `shop` | String | Store domain |
| `affiliateId` | String? (FK) | Attributed affiliate |
| `refCode` | String? | Code used at checkout |
| `totalAmount` | Float | Order total |
| `currency` | String | Currency code (default: USD) |
| `commissionApp` | Float | 5% app fee |
| `commissionAffiliate` | Float | Affiliate's commission |
| `createdAt` | DateTime | Conversion timestamp |

### `ReferralSession`
Auxiliary table for attribution debugging — logs when a referral session was initiated.

---

## API Reference

### `POST /api/click`

Records a click from a referral link.

**Request body:**
```json
{
  "ref": "JOHN2026",
  "shop": "mystore.myshopify.com",
  "userAgent": "Mozilla/5.0 ..."
}
```

**Responses:**
```json
{ "ok": true, "affiliateId": "clxxxxxx" }
{ "ok": true, "skipped": true }           // anti-spam triggered
{ "ok": false, "error": "Affiliate not found" }
```

**Notes:**
- `ref` is normalized to uppercase before lookup
- Skips recording if same affiliate had a click in the last 10 seconds
- Inactive affiliates return 404

---

### `POST /api/conversion`

Records a completed sale and calculates commissions.

**Request body:**
```json
{
  "ref": "JOHN2026",
  "shop": "mystore.myshopify.com",
  "orderId": "gid://shopify/Order/1234567890",
  "totalPrice": "99.99",
  "currency": "USD"
}
```

**Responses:**
```json
{ "ok": true, "conversionId": "clxxxxxx" }
{ "ok": true, "skipped": true }            // orderId already recorded
{ "ok": false, "error": "Affiliate not found" }
```

**Commission calculation:**
```
commissionApp          = totalPrice × 0.05
commissionAffiliate    = totalPrice × (commissionRate / 100)
```

Both endpoints support `OPTIONS` preflight requests and return `Access-Control-Allow-Origin: *` headers.

---

## Setup & Installation

### Prerequisites

- Node.js `>= 20.19`
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started)
- A Shopify Partner account with a development store

### 1. Clone and install dependencies

```bash
git clone <your-repo-url>
cd affiliate-engine
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
# Edit .env with your credentials
```

See [Environment Variables](#environment-variables) for the full list.

### 3. Initialize the database

```bash
npm run setup
# Runs: prisma generate && prisma migrate deploy
```

### 4. (Optional) Seed test data

```bash
npx prisma db seed
```

This creates three test affiliates: `TEST123` (10%), `JOHN2026` (15%), `INFLUENCER1` (20%).

### 5. Start development server

```bash
npm run dev
```

Press **P** in the terminal to open the app URL in your browser.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SHOPIFY_API_KEY` | Yes | App API key from Shopify Partners |
| `SHOPIFY_API_SECRET` | Yes | App secret from Shopify Partners |
| `SHOPIFY_APP_URL` | Yes | Public URL of the app (Cloudflare tunnel URL in dev) |
| `SCOPES` | Yes | Shopify OAuth scopes (comma-separated) |
| `DATABASE_URL` | No | Prisma DB URL (defaults to `file:dev.sqlite`) |
| `SHOP_CUSTOM_DOMAIN` | No | Custom shop domain (optional) |

---

## Web Pixel Configuration

The `affiliate-pixel-v2` extension must be installed on the storefront. After installation, configure the **App URL** setting:

1. In Shopify Admin → **Settings** → **Customer events**
2. Find **affiliate-pixel-v2** → click **Configure**
3. Set **App URL** to your app's public URL (e.g. `https://your-app.trycloudflare.com`)

This URL is used by the pixel to POST click and conversion events to the app's API.

> **Development tip:** The App URL changes every time `shopify app dev` restarts with a new Cloudflare tunnel. Update the pixel setting after each restart.

---

## Running Locally

```bash
# Start the full development environment (app + extensions)
npm run dev

# Type checking
npm run typecheck

# Lint
npm run lint

# Production build
npm run build

# Serve production build
npm run start

# Docker
docker build -t affiliate-engine .
docker run -p 3000:3000 affiliate-engine
```

---

## Seed Data

The seed script (`prisma/seed.ts`) creates three demo affiliates:

| Code | Name | Commission |
|---|---|---|
| `TEST123` | Test Affiliate | 10% |
| `JOHN2026` | John Influencer | 15% |
| `INFLUENCER1` | Top Influencer | 20% |

Run with:
```bash
npx prisma db seed
```

---

## Deployment

The app is containerized and can be deployed to any platform that supports Node.js or Docker:

- [Google Cloud Run](https://shopify.dev/docs/apps/launch/deployment/deploy-to-google-cloud-run)
- [Fly.io](https://fly.io/docs/js/shopify/)
- [Render](https://render.com/docs/deploy-shopify-app)

For production, swap SQLite for a hosted database (PostgreSQL, MySQL) by updating `prisma/schema.prisma` and the `DATABASE_URL` environment variable.

---

## Author

**Leonardo Guacaran**
Built as part of the Converxity technical evaluation — April 2026.
