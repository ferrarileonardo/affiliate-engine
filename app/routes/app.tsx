import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError, Link } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate, AFFILIATE_PLAN } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Volvemos a la versión correcta: solo billing
  const { billing } = await authenticate.admin(request);

  const { hasActivePayment } = await billing.check({
    plans: [AFFILIATE_PLAN],
    isTest: process.env.NODE_ENV !== "production",
  });

  if (!hasActivePayment) {
    return billing.request({
      plan: AFFILIATE_PLAN,
      isTest: process.env.NODE_ENV !== "production",
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app`,
    });
  }

  return { apiKey: process.env.SHOPIFY_API_KEY! };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <nav style={{ padding: "1rem" }}>
        <Link to="/app">Dashboard</Link>
      </nav>
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
