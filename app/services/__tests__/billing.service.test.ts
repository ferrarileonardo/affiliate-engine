import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const { mockAdmin } = vi.hoisted(() => ({
  mockAdmin: { graphql: vi.fn() },
}));

vi.mock("~/db.server", () => ({
  default: {
    appBilling: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("~/shopify.server", () => ({
  unauthenticated: {
    admin: vi.fn().mockResolvedValue({ admin: mockAdmin }),
  },
}));

import prisma from "~/db.server";
import { unauthenticated } from "~/shopify.server";
import {
  getSubscriptionLineItemId,
  createUsageCharge,
} from "../billing.service";

const db = prisma as any;
const mockUnauthenticated = unauthenticated as any;

// Helper to build a successful graphql response
function gqlResponse(data: object) {
  return { json: vi.fn().mockResolvedValue({ data }) };
}

// Helper to build a throttled graphql error
function throttledError() {
  const err: any = new Error("THROTTLED");
  err.errors = [{ extensions: { code: "THROTTLED" } }];
  return err;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUnauthenticated.admin.mockResolvedValue({ admin: mockAdmin });
});

// ─── getSubscriptionLineItemId ────────────────────────────────────────────────

describe("getSubscriptionLineItemId", () => {
  it("returns cached lineItemId when AppBilling is ACTIVE", async () => {
    db.appBilling.findUnique.mockResolvedValue({
      subscriptionLineItemId: "gid://shopify/AppSubscriptionLineItem/cached",
      status: "ACTIVE",
    });

    const result = await getSubscriptionLineItemId("demo.myshopify.com");

    expect(result).toBe("gid://shopify/AppSubscriptionLineItem/cached");
    expect(mockAdmin.graphql).not.toHaveBeenCalled();
  });

  it("queries Shopify when cache is missing", async () => {
    db.appBilling.findUnique.mockResolvedValue(null);
    db.appBilling.upsert.mockResolvedValue({});

    mockAdmin.graphql.mockResolvedValue(
      gqlResponse({
        currentAppInstallation: {
          activeSubscriptions: [
            {
              id: "gid://shopify/AppSubscription/1",
              lineItems: [
                {
                  id: "gid://shopify/AppSubscriptionLineItem/1",
                  plan: {
                    pricingDetails: {
                      cappedAmount: { amount: "100.00", currencyCode: "USD" },
                      terms: "5% fee",
                    },
                  },
                },
              ],
            },
          ],
        },
      }),
    );

    const result = await getSubscriptionLineItemId("demo.myshopify.com");

    expect(result).toBe("gid://shopify/AppSubscriptionLineItem/1");
    expect(db.appBilling.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shop: "demo.myshopify.com" },
        create: expect.objectContaining({
          subscriptionLineItemId: "gid://shopify/AppSubscriptionLineItem/1",
        }),
      }),
    );
  });

  it("queries Shopify when cache status is not ACTIVE", async () => {
    db.appBilling.findUnique.mockResolvedValue({
      subscriptionLineItemId: "old",
      status: "CANCELLED",
    });
    db.appBilling.upsert.mockResolvedValue({});

    mockAdmin.graphql.mockResolvedValue(
      gqlResponse({
        currentAppInstallation: {
          activeSubscriptions: [
            {
              id: "gid://shopify/AppSubscription/2",
              lineItems: [
                {
                  id: "gid://shopify/AppSubscriptionLineItem/2",
                  plan: {
                    pricingDetails: {
                      cappedAmount: { amount: "100.00", currencyCode: "USD" },
                    },
                  },
                },
              ],
            },
          ],
        },
      }),
    );

    const result = await getSubscriptionLineItemId("demo.myshopify.com");
    expect(result).toBe("gid://shopify/AppSubscriptionLineItem/2");
  });

  it("returns null when Shopify has no active subscriptions", async () => {
    db.appBilling.findUnique.mockResolvedValue(null);

    mockAdmin.graphql.mockResolvedValue(
      gqlResponse({
        currentAppInstallation: { activeSubscriptions: [] },
      }),
    );

    const result = await getSubscriptionLineItemId("demo.myshopify.com");
    expect(result).toBeNull();
  });

  it("returns null and does not throw when Shopify call fails", async () => {
    db.appBilling.findUnique.mockResolvedValue(null);
    mockAdmin.graphql.mockRejectedValue(new Error("Network error"));

    const result = await getSubscriptionLineItemId("demo.myshopify.com");
    expect(result).toBeNull();
  });
});

// ─── createUsageCharge ────────────────────────────────────────────────────────

describe("createUsageCharge", () => {
  it("returns null immediately when appFee is zero", async () => {
    const result = await createUsageCharge({
      shop: "demo.myshopify.com",
      appFee: 0,
      orderId: "order-1",
    });
    expect(result).toBeNull();
    expect(mockAdmin.graphql).not.toHaveBeenCalled();
  });

  it("returns null immediately when appFee is negative", async () => {
    const result = await createUsageCharge({
      shop: "demo.myshopify.com",
      appFee: -5,
      orderId: "order-2",
    });
    expect(result).toBeNull();
  });

  it("returns null when no active subscription exists", async () => {
    db.appBilling.findUnique.mockResolvedValue(null);
    mockAdmin.graphql.mockResolvedValue(
      gqlResponse({ currentAppInstallation: { activeSubscriptions: [] } }),
    );

    const result = await createUsageCharge({
      shop: "demo.myshopify.com",
      appFee: 10,
      orderId: "order-3",
    });
    expect(result).toBeNull();
  });

  it("creates usage record and returns charge id", async () => {
    db.appBilling.findUnique.mockResolvedValue({
      subscriptionLineItemId: "gid://shopify/AppSubscriptionLineItem/99",
      status: "ACTIVE",
    });

    mockAdmin.graphql.mockResolvedValue(
      gqlResponse({
        appUsageRecordCreate: {
          appUsageRecord: { id: "gid://shopify/AppUsageRecord/42" },
          userErrors: [],
        },
      }),
    );

    const result = await createUsageCharge({
      shop: "demo.myshopify.com",
      appFee: 10,
      orderId: "order-4",
    });

    expect(result).toBe("gid://shopify/AppUsageRecord/42");
  });

  it("sends the idempotency key as conv-{orderId}", async () => {
    db.appBilling.findUnique.mockResolvedValue({
      subscriptionLineItemId: "gid://shopify/AppSubscriptionLineItem/99",
      status: "ACTIVE",
    });

    mockAdmin.graphql.mockResolvedValue(
      gqlResponse({
        appUsageRecordCreate: {
          appUsageRecord: { id: "gid://shopify/AppUsageRecord/1" },
          userErrors: [],
        },
      }),
    );

    await createUsageCharge({
      shop: "demo.myshopify.com",
      appFee: 5,
      orderId: "my-order-123",
    });

    expect(mockAdmin.graphql).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        variables: expect.objectContaining({
          idempotencyKey: "conv-my-order-123",
        }),
      }),
    );
  });

  it("sends the fee formatted to 2 decimal places", async () => {
    db.appBilling.findUnique.mockResolvedValue({
      subscriptionLineItemId: "gid://shopify/AppSubscriptionLineItem/99",
      status: "ACTIVE",
    });

    mockAdmin.graphql.mockResolvedValue(
      gqlResponse({
        appUsageRecordCreate: {
          appUsageRecord: { id: "gid://shopify/AppUsageRecord/1" },
          userErrors: [],
        },
      }),
    );

    await createUsageCharge({
      shop: "demo.myshopify.com",
      appFee: 9.999,
      orderId: "order-5",
    });

    expect(mockAdmin.graphql).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        variables: expect.objectContaining({
          price: { amount: "10.00", currencyCode: "USD" },
        }),
      }),
    );
  });

  it("returns null when Shopify returns userErrors", async () => {
    db.appBilling.findUnique.mockResolvedValue({
      subscriptionLineItemId: "gid://shopify/AppSubscriptionLineItem/99",
      status: "ACTIVE",
    });

    mockAdmin.graphql.mockResolvedValue(
      gqlResponse({
        appUsageRecordCreate: {
          appUsageRecord: null,
          userErrors: [{ field: "price", message: "Amount exceeds cap" }],
        },
      }),
    );

    const result = await createUsageCharge({
      shop: "demo.myshopify.com",
      appFee: 200,
      orderId: "order-6",
    });

    expect(result).toBeNull();
  });

  it("returns null and does not throw when graphql call rejects", async () => {
    db.appBilling.findUnique.mockResolvedValue({
      subscriptionLineItemId: "gid://shopify/AppSubscriptionLineItem/99",
      status: "ACTIVE",
    });

    mockAdmin.graphql.mockRejectedValue(new Error("timeout"));

    const result = await createUsageCharge({
      shop: "demo.myshopify.com",
      appFee: 10,
      orderId: "order-7",
    });

    expect(result).toBeNull();
  });

  it("retries on THROTTLED error and eventually succeeds", async () => {
    vi.useFakeTimers();

    db.appBilling.findUnique.mockResolvedValue({
      subscriptionLineItemId: "gid://shopify/AppSubscriptionLineItem/99",
      status: "ACTIVE",
    });

    mockAdmin.graphql
      .mockRejectedValueOnce(throttledError())
      .mockResolvedValue(
        gqlResponse({
          appUsageRecordCreate: {
            appUsageRecord: { id: "gid://shopify/AppUsageRecord/retry" },
            userErrors: [],
          },
        }),
      );

    const promise = createUsageCharge({
      shop: "demo.myshopify.com",
      appFee: 10,
      orderId: "order-retry",
    });

    // Advance timers past the first backoff window (BASE_DELAY_MS * 2^0 = 500ms + up to 200ms jitter)
    await vi.advanceTimersByTimeAsync(800);
    const result = await promise;

    expect(result).toBe("gid://shopify/AppUsageRecord/retry");
    expect(mockAdmin.graphql).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("throws after MAX_RETRIES (3) throttled attempts", async () => {
    vi.useFakeTimers();

    db.appBilling.findUnique.mockResolvedValue({
      subscriptionLineItemId: "gid://shopify/AppSubscriptionLineItem/99",
      status: "ACTIVE",
    });

    mockAdmin.graphql.mockRejectedValue(throttledError());

    const promise = createUsageCharge({
      shop: "demo.myshopify.com",
      appFee: 10,
      orderId: "order-exhaust",
    });

    // Advance past all backoff windows: 500 + 1000 + 2000 + jitter
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    // After MAX_RETRIES exhausted, the error is caught by the outer try/catch → returns null
    expect(result).toBeNull();
    expect(mockAdmin.graphql).toHaveBeenCalledTimes(4); // initial + 3 retries

    vi.useRealTimers();
  });
});
