import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate, AFFILIATE_PLAN } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);

  // Check if the merchant has an active usage-based subscription.
  // billing.request() throws a redirect to Shopify's billing confirmation
  // page — the merchant approves once, then returns to the app.
  const { hasActivePayment } = await billing.check({
    plans: [AFFILIATE_PLAN],
    isTest: process.env.NODE_ENV !== "production",
  });

  if (!hasActivePayment) {
    await billing.request({
      plan: AFFILIATE_PLAN,
      isTest: process.env.NODE_ENV !== "production",
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app`,
    });
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
