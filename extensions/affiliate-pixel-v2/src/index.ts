import { register } from "@shopify/web-pixels-extension";

register(({ analytics, browser, init }) => {
  const data = init.data as unknown as {
    shop?: { myshopifyDomain?: string };
    pixelSettings?: { accountID?: string };
    settings?: { accountID?: string };
  };

  const shopDomain = data?.shop?.myshopifyDomain ?? "";

  const appUrl =
    data?.pixelSettings?.accountID ??
    data?.settings?.accountID ??
    "";

  const COOKIE_NAME = "affiliate_ref";
  const CLICK_SENT_KEY = "affiliate_click_sent";

  // PAGE VIEWED
  analytics.subscribe("page_viewed", async (event: unknown) => {
    try {
      const e = event as {
        context?: {
          window?: { location?: { href?: string } };
          document?: { location?: { href?: string } };
          navigator?: { userAgent?: string };
        };
      };

      const href =
        e.context?.window?.location?.href ??
        e.context?.document?.location?.href ??
        "";

      if (!href) return;

      const url = new URL(href);
      const ref = url.searchParams.get("ref");

      if (ref) {
        const normalizedRef = ref.trim().toUpperCase();

        const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();

        await browser.cookie.set(
          `${COOKIE_NAME}=${normalizedRef}; expires=${expires}; path=/; SameSite=None; Secure`,
        );

        await browser.sessionStorage.setItem(COOKIE_NAME, normalizedRef);

        const clickSent = await browser.sessionStorage.getItem(CLICK_SENT_KEY);

        if (!clickSent && appUrl) {
          await browser.sessionStorage.setItem(CLICK_SENT_KEY, "1");

          fetch(`${appUrl}/api/click`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ref: normalizedRef,
              shop: shopDomain,
              userAgent: e.context?.navigator?.userAgent ?? "",
            }),
          }).catch(() => {});
        }
      } else {
        const cookie = await browser.cookie.get(COOKIE_NAME);
        const session = await browser.sessionStorage.getItem(COOKIE_NAME);

        if (cookie && !session) {
          await browser.sessionStorage.setItem(COOKIE_NAME, cookie);
        }
      }
    } catch (err) {
      console.error("[affiliate-pixel] page_viewed error:", err);
    }
  });

  // CHECKOUT COMPLETED
  analytics.subscribe("checkout_completed", async (event: unknown) => {
    try {
      const e = event as {
        data?: {
          checkout?: {
            order?: { id?: string };
            totalPrice?: { amount?: string; currencyCode?: string };
          };
        };
      };

      const ref =
        (await browser.sessionStorage.getItem(COOKIE_NAME)) ??
        (await browser.cookie.get(COOKIE_NAME));

      if (!ref || !appUrl) return;

      const checkout = e.data?.checkout;
      if (!checkout) return;

      const orderId = checkout.order?.id ?? "";
      const totalPrice = checkout.totalPrice?.amount ?? "0";
      const currency = checkout.totalPrice?.currencyCode ?? "USD";

      if (!orderId) return;

      fetch(`${appUrl}/api/conversion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ref,
          shop: shopDomain,
          orderId,
          totalPrice,
          currency,
        }),
      }).catch(() => {});
    } catch (err) {
      console.error("[affiliate-pixel] checkout_completed error:", err);
    }
  });
});
