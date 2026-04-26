import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "~/db.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return new Response(null, { status: 405 });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const body = await request.json();

    const { ref, shop, orderId, totalPrice, currency } = body;

    if (!ref || !orderId || !totalPrice || !shop) {
      return Response.json(
        { ok: false, error: "Missing required fields" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const normalizedRef = String(ref).trim().toUpperCase();

    const affiliate = await prisma.affiliate.findUnique({
      where: { code: normalizedRef },
    });

    if (!affiliate) {
      return Response.json(
        { ok: false, error: "Affiliate not found" },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    const existing = await prisma.conversion.findUnique({
      where: { orderId: String(orderId) },
    });

    if (existing) {
      return Response.json(
        { ok: true, skipped: true },
        { headers: CORS_HEADERS },
      );
    }

    const total = Number(totalPrice);
    const appFee = +(total * 0.05).toFixed(2);
    const affiliateCommission = +(
      total *
      (affiliate.commissionRate / 100)
    ).toFixed(2);

    const conversion = await prisma.conversion.create({
      data: {
        affiliateId: affiliate.id,
        orderId: String(orderId),
        shop: String(shop),
        refCode: normalizedRef,
        totalAmount: total,
        commissionApp: appFee,
        commissionAffiliate: affiliateCommission,
        currency: currency ?? "USD",
      },
    });

    return Response.json(
      { ok: true, conversionId: conversion.id },
      { headers: CORS_HEADERS },
    );
  } catch (err) {
    console.error("CONVERSION API ERROR:", err);
    return Response.json(
      { ok: false, error: "Server error" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
