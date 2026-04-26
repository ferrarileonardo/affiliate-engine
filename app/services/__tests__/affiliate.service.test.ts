import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/db.server", () => {
  const mock = {
    affiliate: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  return { default: mock };
});

import prisma from "~/db.server";
import {
  createAffiliate,
  getAffiliates,
  getAffiliateByCode,
  getAffiliateById,
  updateAffiliate,
  deleteAffiliate,
} from "../affiliate.service";

const db = prisma as any;

beforeEach(() => vi.clearAllMocks());

// ─── createAffiliate ──────────────────────────────────────────────────────────

describe("createAffiliate", () => {
  it("normalizes code to uppercase", async () => {
    db.affiliate.create.mockResolvedValue({ id: "1", code: "JOHN2026" });
    await createAffiliate({ code: "john2026", commissionRate: 10 });
    expect(db.affiliate.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: "JOHN2026" }) }),
    );
  });

  it("trims whitespace from code", async () => {
    db.affiliate.create.mockResolvedValue({ id: "1", code: "TRIM" });
    await createAffiliate({ code: "  trim  ", commissionRate: 10 });
    expect(db.affiliate.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: "TRIM" }) }),
    );
  });

  it("stores null when name is not provided", async () => {
    db.affiliate.create.mockResolvedValue({ id: "1" });
    await createAffiliate({ code: "CODE", commissionRate: 15 });
    expect(db.affiliate.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: null }) }),
    );
  });

  it("stores the provided name", async () => {
    db.affiliate.create.mockResolvedValue({ id: "1" });
    await createAffiliate({ code: "CODE", commissionRate: 15, name: "Alice" });
    expect(db.affiliate.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "Alice" }) }),
    );
  });

  it("stores the commission rate as-is", async () => {
    db.affiliate.create.mockResolvedValue({ id: "1" });
    await createAffiliate({ code: "X", commissionRate: 12.5 });
    expect(db.affiliate.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ commissionRate: 12.5 }) }),
    );
  });
});

// ─── getAffiliates ────────────────────────────────────────────────────────────

describe("getAffiliates", () => {
  it("returns all affiliates ordered by createdAt desc", async () => {
    const mockList = [{ id: "2" }, { id: "1" }];
    db.affiliate.findMany.mockResolvedValue(mockList);
    const result = await getAffiliates();
    expect(result).toEqual(mockList);
    expect(db.affiliate.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
    });
  });
});

// ─── getAffiliateByCode ───────────────────────────────────────────────────────

describe("getAffiliateByCode", () => {
  it("normalizes code to uppercase before querying", async () => {
    db.affiliate.findUnique.mockResolvedValue(null);
    await getAffiliateByCode("john2026");
    expect(db.affiliate.findUnique).toHaveBeenCalledWith({
      where: { code: "JOHN2026" },
    });
  });

  it("trims whitespace before querying", async () => {
    db.affiliate.findUnique.mockResolvedValue(null);
    await getAffiliateByCode("  CODE  ");
    expect(db.affiliate.findUnique).toHaveBeenCalledWith({
      where: { code: "CODE" },
    });
  });

  it("returns the affiliate when found", async () => {
    const affiliate = { id: "abc", code: "FOUND" };
    db.affiliate.findUnique.mockResolvedValue(affiliate);
    const result = await getAffiliateByCode("found");
    expect(result).toEqual(affiliate);
  });

  it("returns null when affiliate does not exist", async () => {
    db.affiliate.findUnique.mockResolvedValue(null);
    const result = await getAffiliateByCode("GHOST");
    expect(result).toBeNull();
  });
});

// ─── getAffiliateById ─────────────────────────────────────────────────────────

describe("getAffiliateById", () => {
  it("queries by id directly", async () => {
    db.affiliate.findUnique.mockResolvedValue({ id: "xyz" });
    const result = await getAffiliateById("xyz");
    expect(db.affiliate.findUnique).toHaveBeenCalledWith({ where: { id: "xyz" } });
    expect(result).toEqual({ id: "xyz" });
  });
});

// ─── updateAffiliate ──────────────────────────────────────────────────────────

describe("updateAffiliate", () => {
  it("normalizes code to uppercase when provided", async () => {
    db.affiliate.update.mockResolvedValue({});
    await updateAffiliate("id1", { code: "newcode" });
    expect(db.affiliate.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: "NEWCODE" }) }),
    );
  });

  it("does not include code in update when not provided", async () => {
    db.affiliate.update.mockResolvedValue({});
    await updateAffiliate("id1", { isActive: false });
    const callArg = db.affiliate.update.mock.calls[0][0];
    expect(callArg.data).not.toHaveProperty("code");
  });

  it("includes isActive when provided", async () => {
    db.affiliate.update.mockResolvedValue({});
    await updateAffiliate("id1", { isActive: false });
    expect(db.affiliate.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isActive: false }) }),
    );
  });

  it("includes commissionRate when provided", async () => {
    db.affiliate.update.mockResolvedValue({});
    await updateAffiliate("id1", { commissionRate: 20 });
    expect(db.affiliate.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ commissionRate: 20 }) }),
    );
  });
});

// ─── deleteAffiliate ──────────────────────────────────────────────────────────

describe("deleteAffiliate", () => {
  it("deletes by id", async () => {
    db.affiliate.delete.mockResolvedValue({ id: "del" });
    await deleteAffiliate("del");
    expect(db.affiliate.delete).toHaveBeenCalledWith({ where: { id: "del" } });
  });
});
