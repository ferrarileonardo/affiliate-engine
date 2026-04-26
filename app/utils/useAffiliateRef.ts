import { useEffect } from "react";

const COOKIE_NAME = "affiliate_ref";
const CLICK_SENT_KEY = "affiliate_click_sent";

function setCookie(name: string, value: string, days = 30) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();

  document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=None; Secure`;
}

function getCookie(name: string) {
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(name + "="))
    ?.split("=")[1];
}

export function useAffiliateRef() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const refFromUrl = url.searchParams.get("ref");

    const existingCookie = getCookie(COOKIE_NAME);
    const existingSession = sessionStorage.getItem(COOKIE_NAME);

    console.log("🔍 REF URL:", refFromUrl);
    console.log("🍪 COOKIE:", existingCookie);
    console.log("💾 SESSION:", existingSession);

    // 🚨 CASO PRINCIPAL: viene ref en URL
    if (refFromUrl) {
      // 🔒 Evitar doble tracking de click (CRÍTICO)
      if (!sessionStorage.getItem(CLICK_SENT_KEY)) {
        sessionStorage.setItem(CLICK_SENT_KEY, "1");

        fetch("/api/click", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ref: refFromUrl,
            shop: window.location.hostname,
            userAgent: navigator.userAgent,
          }),
        }).catch((err) => {
          console.error("Click tracking failed:", err);
        });
      }

      // 💾 Persistencia local
      sessionStorage.setItem(COOKIE_NAME, refFromUrl);

      if (!existingCookie) {
        setCookie(COOKIE_NAME, refFromUrl);
      }

      return;
    }

    // 🔁 fallback sync cookie → session
    if (!existingSession && existingCookie) {
      sessionStorage.setItem(COOKIE_NAME, existingCookie);
    }
  }, []);
}
