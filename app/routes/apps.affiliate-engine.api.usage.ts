import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";
import { createUsageChargeExpress } from "../services/billing.express";

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
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    const body = await request.json();
    const { orderId } = body;

    if (!orderId) {
      return Response.json(
        { ok: false, error: "Missing orderId" },
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

    if (conversion.billingChargeId) {
      return Response.json(
        { ok: true, skipped: true },
        { headers: CORS_HEADERS }
      );
    }

    const appFee = conversion.commissionApp;

    const chargeId = await createUsageChargeExpress({
      shop,
      appFee,
      orderId,
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
