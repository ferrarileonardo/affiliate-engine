import "@shopify/shopify-app-react-router/adapters/node";

import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
  BillingInterval,
} from "@shopify/shopify-app-react-router/server";

import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

// Billing plan name — must match the key used in billing.check / billing.request
export const AFFILIATE_PLAN = "Affiliate Commission Plan";

// 🔐 Validaciones (opcional pero recomendado)
if (!process.env.SHOPIFY_APP_URL) {
  throw new Error("SHOPIFY_APP_URL no está definida");
}

if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET) {
  throw new Error("Faltan credenciales de Shopify");
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,

  apiVersion: ApiVersion.January25,

  scopes: process.env.SCOPES?.split(",") || [],

  appUrl: process.env.SHOPIFY_APP_URL,

  authPathPrefix: "/auth",

  sessionStorage: new PrismaSessionStorage(prisma),

  distribution: AppDistribution.AppStore,

  future: {
    expiringOfflineAccessTokens: true,
  },

  // ─── Usage-based billing ─────────────────────────────────────────────────
  // Capped at $100 USD/month. Each conversion triggers a UsageRecord
  // via appUsageRecordCreate (5% of the referred sale total).
  billing: {
    [AFFILIATE_PLAN]: {
      lineItems: [
        {
          amount: 100,
          currencyCode: "USD",
          interval: BillingInterval.Usage,
          terms:
            "5% service fee on each referred sale. Capped at $100 USD/month.",
        },
      ],
      trialDays: 0,
    },
  },

  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;

// exports necesarios
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
