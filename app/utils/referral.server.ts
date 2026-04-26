import { getAffiliateByCode } from "~/services/affiliate.service";

export async function resolveAffiliate(ref?: string | null) {
  if (!ref) return null;

  const code = ref.trim().toUpperCase();

  const affiliate = await getAffiliateByCode(code);

  return affiliate || null;
}
