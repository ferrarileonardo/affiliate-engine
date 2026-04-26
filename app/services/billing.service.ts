import prisma from "~/db.server";
import { unauthenticated } from "~/shopify.server";

// ─── Retry with exponential backoff (Shopify leaky-bucket rate limit) ─────────

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

async function withRetry<T>(
  fn: () => Promise<T>,
  attempt = 0,
): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    const throttled =
      err?.response?.status === 429 ||
      err?.message?.includes("THROTTLED") ||
      (Array.isArray(err?.errors) &&
        err.errors.some(
          (e: any) => e?.extensions?.code === "THROTTLED",
        ));

    if (throttled && attempt < MAX_RETRIES) {
      // exponential backoff with full jitter
      const delay = BASE_DELAY_MS * 2 ** attempt + Math.random() * 200;
      await new Promise((res) => setTimeout(res, delay));
      return withRetry(fn, attempt + 1);
    }
    throw err;
  }
}

// ─── Query Shopify for the active subscription line item ──────────────────────

async function fetchSubscriptionFromShopify(shop: string): Promise<{
  subscriptionId: string;
  subscriptionLineItemId: string;
} | null> {
  const { admin } = await unauthenticated.admin(shop);

  const res = await withRetry(() =>
    admin.graphql(`#graphql
      query GetActiveSubscription {
        currentAppInstallation {
          activeSubscriptions {
            id
            lineItems {
              id
              plan {
                pricingDetails {
                  ... on AppUsagePricing {
                    cappedAmount { amount currencyCode }
                    terms
                  }
                }
              }
            }
          }
        }
      }
    `),
  );

  const data = await res.json();
  const subs =
    data?.data?.currentAppInstallation?.activeSubscriptions ?? [];

  if (!subs.length) return null;

  const sub = subs[0];
  // find the usage line item
  const lineItem = sub.lineItems.find(
    (li: any) => li.plan?.pricingDetails?.cappedAmount,
  );

  if (!lineItem) return null;

  return {
    subscriptionId: sub.id,
    subscriptionLineItemId: lineItem.id,
  };
}

// ─── Get (or cache) the subscription line item ID for a shop ─────────────────

export async function getSubscriptionLineItemId(
  shop: string,
): Promise<string | null> {
  // 1. Try the cache
  const cached = await prisma.appBilling.findUnique({ where: { shop } });
  if (cached?.subscriptionLineItemId && cached.status === "ACTIVE") {
    return cached.subscriptionLineItemId;
  }

  // 2. Query Shopify
  const result = await fetchSubscriptionFromShopify(shop).catch((err) => {
    console.error(`[billing] fetchSubscription failed for ${shop}:`, err);
    return null;
  });

  if (!result) return null;

  // 3. Upsert cache
  await prisma.appBilling.upsert({
    where: { shop },
    create: {
      shop,
      subscriptionId: result.subscriptionId,
      subscriptionLineItemId: result.subscriptionLineItemId,
      status: "ACTIVE",
    },
    update: {
      subscriptionId: result.subscriptionId,
      subscriptionLineItemId: result.subscriptionLineItemId,
      status: "ACTIVE",
    },
  });

  return result.subscriptionLineItemId;
}

// ─── Create a usage record for a conversion ───────────────────────────────────

export async function createUsageCharge(params: {
  shop: string;
  appFee: number;
  orderId: string;
}): Promise<string | null> {
  const { shop, appFee, orderId } = params;

  if (appFee <= 0) return null;

  const lineItemId = await getSubscriptionLineItemId(shop);
  if (!lineItemId) {
    console.warn(`[billing] No active subscription for ${shop} — charge skipped`);
    return null;
  }

  try {
    const { admin } = await unauthenticated.admin(shop);

    const res = await withRetry(() =>
      admin.graphql(
        `#graphql
          mutation AppUsageRecordCreate(
            $subscriptionLineItemId: ID!
            $price: MoneyInput!
            $description: String!
            $idempotencyKey: String
          ) {
            appUsageRecordCreate(
              subscriptionLineItemId: $subscriptionLineItemId
              price: $price
              description: $description
              idempotencyKey: $idempotencyKey
            ) {
              appUsageRecord { id }
              userErrors { field message }
            }
          }
        `,
        {
          variables: {
            subscriptionLineItemId: lineItemId,
            price: { amount: appFee.toFixed(2), currencyCode: "USD" },
            description: `5% service fee — order ${orderId}`,
            // idempotency key prevents double-charging if retried
            idempotencyKey: `conv-${orderId}`,
          },
        },
      ),
    );

    const data = await res.json();
    const result = data?.data?.appUsageRecordCreate;

    if (result?.userErrors?.length) {
      console.error(
        `[billing] userErrors for ${shop}:`,
        result.userErrors.map((e: any) => e.message).join(", "),
      );
      return null;
    }

    return result?.appUsageRecord?.id ?? null;
  } catch (err) {
    console.error(`[billing] createUsageCharge failed for ${shop}:`, err);
    return null;
  }
}
