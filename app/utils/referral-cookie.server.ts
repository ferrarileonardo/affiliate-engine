import { createCookie } from "react-router";

export const referralCookie = createCookie("affiliate_ref", {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  sameSite: "lax",
  maxAge: 60 * 60 * 24 * 30, // 30 días
});
