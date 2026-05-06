import type { ActionFunctionArgs } from "@remix-run/node";
import prisma from "~/db.server";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = await request.json();

    const conversion = await prisma.conversion.create({
      data: {
        orderId: body.orderId,
        shop: "affiliate-engine-dev.myshopify.com", // puedes poner cualquier valor
        totalAmount: body.amount,
        currency: "USD",
        email: "test@example.com",
        commissionApp: body.amount * 0.05,        // 5% para la app
        commissionAffiliate: body.amount * 0.10,  // 10% para el afiliado
        refCode: body.affiliateCode,
      },
    });

    return Response.json({ ok: true, conversion });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) });
  }
}
