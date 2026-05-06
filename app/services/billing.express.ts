import prisma from "../db.server";

const SHOPIFY_API_VERSION = "2024-04";

async function getAccessToken(shop: string): Promise<string | null> {
  const session = await prisma.session.findFirst({
    where: { shop },
  });

  return session?.accessToken ?? null;
}

export async function createUsageChargeExpress(params: {
  shop: string;
  appFee: number;
  orderId: string;
}): Promise<string | null> {
  const { shop, appFee, orderId } = params;

  if (appFee <= 0) return null;

  const accessToken = await getAccessToken(shop);
  if (!accessToken) {
    console.error(`[billing] No access token for ${shop}`);
    return null;
  }

  const billing = await prisma.appBilling.findUnique({
    where: { shop },
  });

  if (!billing?.subscriptionLineItemId) {
    console.warn(`[billing] No subscription line item for ${shop}`);
    return null;
  }

  const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  const body = {
    query: `
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
    variables: {
      subscriptionLineItemId: billing.subscriptionLineItemId,
      price: { amount: appFee.toFixed(2), currencyCode: "USD" },
      description: `5% service fee — order ${orderId}`,
      idempotencyKey: `conv-${orderId}`,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  const result = data?.data?.appUsageRecordCreate;

  if (result?.userErrors?.length) {
    console.error("[billing] userErrors:", result.userErrors);
    return null;
  }

  return result?.appUsageRecord?.id ?? null;
}
