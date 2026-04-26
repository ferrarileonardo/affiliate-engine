import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "~/db.server";

type ClickPayload = {
  ref: string;
  shop?: string;
  userAgent?: string;
};

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
    const body = (await request.json()) as ClickPayload;
    const { ref, shop, userAgent } = body;

    if (!ref || typeof ref !== "string") {
      return Response.json(
        { ok: false, error: "Missing ref" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const normalizedRef = ref.trim().toUpperCase();

    const affiliate = await prisma.affiliate.findUnique({
      where: { code: normalizedRef },
    });

    if (!affiliate || !affiliate.isActive) {
      return Response.json(
        { ok: false, error: "Affiliate not found" },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    // Anti-spam: skip if same affiliate clicked in last 10 seconds
    const lastClick = await prisma.click.findFirst({
      where: { affiliateId: affiliate.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    if (lastClick && Date.now() - lastClick.createdAt.getTime() < 10_000) {
      return Response.json(
        { ok: true, skipped: true },
        { headers: CORS_HEADERS },
      );
    }

    await prisma.click.create({
      data: {
        affiliateId: affiliate.id,
        refCode: normalizedRef,
        shop: shop ?? null,
        userAgent: userAgent ?? null,
      },
    });

    return Response.json(
      { ok: true, affiliateId: affiliate.id },
      { headers: CORS_HEADERS },
    );
  } catch (error) {
    console.error("CLICK API ERROR:", error);
    return Response.json(
      { ok: false, error: "Server error" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
