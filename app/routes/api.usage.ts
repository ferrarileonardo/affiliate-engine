import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import prisma from "~/db.server";
import { createUsageCharge } from "~/services/billing.service";

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
    const { orderId, shop } = body;

    if (!orderId || !shop) {
      return Response.json(
        { ok: false, error: "Missing required fields" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const conversion = await prisma.conversion.findUnique({
      where: { orderId: String(orderId) },
    });

    if (!conversion) {
      return Response.json(
        { ok: false, error: "Conversion not found" },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    // Si ya tiene billingChargeId, no volvemos a cobrar
    if (conversion.billingChargeId) {
      return Response.json(
        { ok: true, skipped: true },
        { headers: CORS_HEADERS }
      );
    }

    const appFee = conversion.commissionApp;

    const chargeId = await createUsageCharge({
      shop: String(shop),
      appFee,
      orderId: String(orderId),
    });

    if (chargeId) {
      await prisma.conversion.update({
        where: { id: conversion.id },
        data: { billingChargeId: chargeId },
      });
    }

    return Response.json(
      { ok: true, billed: true, chargeId },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("USAGE API ERROR:", err);
    return Response.json(
      { ok: false, error: "Server error" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
