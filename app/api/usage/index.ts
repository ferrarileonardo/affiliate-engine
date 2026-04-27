import type { ActionFunctionArgs } from "@remix-run/node";
import prisma from "../../db.server";
import shopify from "../../shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = await request.json();
    const { shop, conversionId } = body;

    if (!shop || !conversionId) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing required fields" }),
        { status: 400 }
      );
    }

    const conversion = await prisma.conversion.findUnique({
      where: { id: conversionId },
    });

    if (!conversion) {
      return new Response(
        JSON.stringify({ ok: false, error: "Conversion not found" }),
        { status: 404 }
      );
    }

    const billing = await prisma.appBilling.findUnique({
      where: { shop },
    });

    if (!billing) {
      return new Response(
        JSON.stringify({ ok: false, error: "Shop has no billing setup" }),
        { status: 400 }
      );
    }

    const { admin } = await shopify.authenticate.admin(shop);

    // Ejecutar mutación
    const raw = await admin.graphql(
      `#graphql
      mutation CreateUsageRecord(
        $subscriptionLineItemId: ID!,
        $price: MoneyInput!,
        $description: String!
      ) {
        appUsageRecordCreate(
          subscriptionLineItemId: $subscriptionLineItemId,
          price: $price,
          description: $description
        ) {
          appUsageRecord {
            id
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          subscriptionLineItemId: billing.subscriptionLineItemId,
          price: {
            amount: conversion.commissionApp.toString(),
            currencyCode: conversion.currency,
          },
          description: `Affiliate commission for order ${conversion.orderId}`,
        },
      }
    );

    // 👇 ESTA ES LA CLAVE
    const response = await raw.json();

    const recordId =
      response.data?.appUsageRecordCreate?.appUsageRecord?.id ?? null;

    if (!recordId) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Failed to create usage record",
          details: response.data?.appUsageRecordCreate?.userErrors,
        }),
        { status: 500 }
      );
    }

    await prisma.conversion.update({
      where: { id: conversionId },
      data: { billingChargeId: recordId },
    });

    return new Response(
      JSON.stringify({ ok: true, usageRecordId: recordId }),
      { status: 200 }
    );
  } catch (err) {
    console.error("[/api/usage] ERROR:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Internal server error" }),
      { status: 500 }
    );
  }
}
