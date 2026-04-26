import { register } from "@shopify/web-pixels-extension";

register(({ analytics, browser, init }) => {
  const shopDomain: string = (init.data as any)?.shop?.myshopifyDomain ?? "";

  // App base URL configured in pixel settings (accountID field = App URL)
  const appUrl: string =
    (init.data as any)?.pixelSettings?.accountID ??
    (init.data as any)?.settings?.accountID ??
    "";

  const COOKIE_NAME = "affiliate_ref";
  const CLICK_SENT_KEY = "affiliate_click_sent";

  // Capture ?ref= from URL on every page view and persist to storage
  analytics.subscribe("page_viewed", async (event) => {
    try {
      const href: string =
        (event.context as any)?.window?.location?.href ??
        (event.context as any)?.document?.location?.href ??
        "";

      if (!href) return;

      const url = new URL(href);
      const ref = url.searchParams.get("ref");

      if (ref) {
        const normalizedRef = ref.trim().toUpperCase();

        // Persist ref in cookie (30 days) and sessionStorage
        const expires = new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ).toUTCString();
        await browser.cookie.set(
          `${COOKIE_NAME}=${normalizedRef}; expires=${expires}; path=/; SameSite=None; Secure`,
        );
        await browser.sessionStorage.setItem(COOKIE_NAME, normalizedRef);

        // Track click once per session to avoid duplicates
        const clickSent = await browser.sessionStorage.getItem(CLICK_SENT_KEY);
        if (!clickSent && appUrl) {
          await browser.sessionStorage.setItem(CLICK_SENT_KEY, "1");

          fetch(`${appUrl}/api/click`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ref: normalizedRef,
              shop: shopDomain,
              userAgent: (event.context as any)?.navigator?.userAgent ?? "",
            }),
          }).catch(() => {});
        }
      } else {
        // Sync cookie → sessionStorage for pages that don't have ?ref=
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

  // Track checkout completion and record the conversion
  analytics.subscribe("checkout_completed", async (event) => {
    try {
      // Read ref from sessionStorage first, fall back to cookie
      const ref =
        (await browser.sessionStorage.getItem(COOKIE_NAME)) ??
        (await browser.cookie.get(COOKIE_NAME));

      if (!ref || !appUrl) return;

      const checkout = (event.data as any)?.checkout;
      if (!checkout) return;

      const orderId: string = checkout?.order?.id ?? "";
      const totalPrice: string = checkout?.totalPrice?.amount ?? "0";
      const currency: string = checkout?.totalPrice?.currencyCode ?? "USD";

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
