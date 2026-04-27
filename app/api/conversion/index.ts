import type { ActionFunctionArgs } from "@remix-run/node";
import prisma from "../../db.server";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = await request.json();
    const { ref, amount, orderId, shop, email } = body;

    if (!ref || !amount || !orderId) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing required fields" }),
        { status: 400 }
      );
    }

    const refCode = ref.trim().toUpperCase();

    // Buscar afiliado
    const affiliate = await prisma.affiliate.findUnique({
      where: { code: refCode },
    });

    // Calcular comisiones (ejemplo: 70% afiliado, 30% app)
    const totalAmount = Number(amount);
    const commissionAffiliate = totalAmount * (affiliate?.commissionRate ?? 0.7);
    const commissionApp = totalAmount - commissionAffiliate;

    // Registrar conversión
    const conversion = await prisma.conversion.create({
      data: {
        orderId,
        shop,
        refCode,
        email: email ?? null,
        affiliateId: affiliate?.id ?? null,
        totalAmount,
        currency: "USD",
        commissionApp,
        commissionAffiliate,
      },
    });

    return new Response(
      JSON.stringify({ ok: true, conversion }),
      { status: 200 }
    );
  } catch (err) {
    console.error("[/api/conversion] ERROR:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Internal server error" }),
      { status: 500 }
    );
  }
}
