import prisma from "~/db.server";

/**
 * Crear afiliado
 */
export async function createAffiliate(data: {
  code: string;
  commissionRate: number;
  name?: string | null;
}) {
  const normalizedCode = data.code.trim().toUpperCase();

  return prisma.affiliate.create({
    data: {
      code: normalizedCode,
      commissionRate: data.commissionRate,
      name: data.name ?? null,
    },
  });
}

/**
 * Obtener todos los afiliados
 */
export async function getAffiliates() {
  return prisma.affiliate.findMany({
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Obtener afiliado por código (CLAVE para ?ref=CODE)
 */
export async function getAffiliateByCode(code: string) {
  return prisma.affiliate.findUnique({
    where: {
      code: code.trim().toUpperCase(),
    },
  });
}

/**
 * Obtener afiliado por ID
 */
export async function getAffiliateById(id: string) {
  return prisma.affiliate.findUnique({
    where: { id },
  });
}

/**
 * Actualizar afiliado
 */
export async function updateAffiliate(
  id: string,
  data: {
    code?: string;
    commissionRate?: number;
    isActive?: boolean;
  }
) {
  return prisma.affiliate.update({
    where: { id },
    data: {
      ...(data.code && { code: data.code.trim().toUpperCase() }),
      ...(data.commissionRate !== undefined && {
        commissionRate: data.commissionRate,
      }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });
}

/**
 * Eliminar afiliado
 */
export async function deleteAffiliate(id: string) {
  return prisma.affiliate.delete({
    where: { id },
  });
}
