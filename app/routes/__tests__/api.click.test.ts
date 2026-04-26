import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/db.server", () => ({
  default: {
    affiliate: { findUnique: vi.fn() },
    click: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

import prisma from "~/db.server";
import { action, loader } from "~/routes/api.click";

const db = prisma as any;

function makeRequest(method: string, body?: object): Request {
  return new Request("http://localhost/api/click", {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

const activeAffiliate = {
  id: "aff-1",
  code: "JOHN2026",
  isActive: true,
  commissionRate: 15,
};

beforeEach(() => vi.clearAllMocks());

// ─── loader (OPTIONS / method guard) ─────────────────────────────────────────

describe("loader", () => {
  it("returns 204 for OPTIONS preflight", async () => {
    const res = await loader({ request: makeRequest("OPTIONS"), params: {}, context: {} });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("returns 405 for GET requests", async () => {
    const res = await loader({ request: makeRequest("GET"), params: {}, context: {} });
    expect(res.status).toBe(405);
  });
});

// ─── action ───────────────────────────────────────────────────────────────────

describe("action", () => {
  it("returns 204 for OPTIONS preflight", async () => {
    const res = await action({ request: makeRequest("OPTIONS"), params: {}, context: {} });
    expect(res.status).toBe(204);
  });

  it("returns 400 when ref is missing", async () => {
    const res = await action({
      request: makeRequest("POST", { shop: "demo.myshopify.com" }),
      params: {},
      context: {},
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/missing ref/i);
  });

  it("returns 400 when ref is not a string", async () => {
    const res = await action({
      request: makeRequest("POST", { ref: 123 }),
      params: {},
      context: {},
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when affiliate does not exist", async () => {
    db.affiliate.findUnique.mockResolvedValue(null);

    const res = await action({
      request: makeRequest("POST", { ref: "GHOST", shop: "demo.myshopify.com" }),
      params: {},
      context: {},
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("returns 404 when affiliate is inactive", async () => {
    db.affiliate.findUnique.mockResolvedValue({ ...activeAffiliate, isActive: false });

    const res = await action({
      request: makeRequest("POST", { ref: "JOHN2026", shop: "demo.myshopify.com" }),
      params: {},
      context: {},
    });

    expect(res.status).toBe(404);
  });

  it("normalizes ref to uppercase before querying", async () => {
    db.affiliate.findUnique.mockResolvedValue(activeAffiliate);
    db.click.findFirst.mockResolvedValue(null);
    db.click.create.mockResolvedValue({ id: "click-1" });

    await action({
      request: makeRequest("POST", { ref: "john2026", shop: "demo.myshopify.com" }),
      params: {},
      context: {},
    });

    expect(db.affiliate.findUnique).toHaveBeenCalledWith({
      where: { code: "JOHN2026" },
    });
  });

  it("returns skipped:true when same affiliate clicked within 10 seconds", async () => {
    db.affiliate.findUnique.mockResolvedValue(activeAffiliate);
    db.click.findFirst.mockResolvedValue({ createdAt: new Date() }); // just now

    const res = await action({
      request: makeRequest("POST", { ref: "JOHN2026", shop: "demo.myshopify.com" }),
      params: {},
      context: {},
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.skipped).toBe(true);
    expect(db.click.create).not.toHaveBeenCalled();
  });

  it("records click when last click was more than 10 seconds ago", async () => {
    db.affiliate.findUnique.mockResolvedValue(activeAffiliate);
    db.click.findFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 15_000),
    });
    db.click.create.mockResolvedValue({ id: "click-2" });

    const res = await action({
      request: makeRequest("POST", { ref: "JOHN2026", shop: "demo.myshopify.com" }),
      params: {},
      context: {},
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.affiliateId).toBe("aff-1");
    expect(db.click.create).toHaveBeenCalledOnce();
  });

  it("records click when there is no previous click", async () => {
    db.affiliate.findUnique.mockResolvedValue(activeAffiliate);
    db.click.findFirst.mockResolvedValue(null);
    db.click.create.mockResolvedValue({ id: "click-3" });

    const res = await action({
      request: makeRequest("POST", { ref: "JOHN2026", shop: "demo.myshopify.com" }),
      params: {},
      context: {},
    });

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.affiliateId).toBe("aff-1");
    expect(db.click.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          affiliateId: "aff-1",
          refCode: "JOHN2026",
          shop: "demo.myshopify.com",
        }),
      }),
    );
  });

  it("stores null for shop and userAgent when omitted", async () => {
    db.affiliate.findUnique.mockResolvedValue(activeAffiliate);
    db.click.findFirst.mockResolvedValue(null);
    db.click.create.mockResolvedValue({ id: "click-4" });

    await action({
      request: makeRequest("POST", { ref: "JOHN2026" }),
      params: {},
      context: {},
    });

    expect(db.click.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ shop: null, userAgent: null }),
      }),
    );
  });

  it("returns CORS headers on success", async () => {
    db.affiliate.findUnique.mockResolvedValue(activeAffiliate);
    db.click.findFirst.mockResolvedValue(null);
    db.click.create.mockResolvedValue({ id: "click-5" });

    const res = await action({
      request: makeRequest("POST", { ref: "JOHN2026", shop: "demo.myshopify.com" }),
      params: {},
      context: {},
    });

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("returns 500 on unexpected error", async () => {
    db.affiliate.findUnique.mockRejectedValue(new Error("DB down"));

    const res = await action({
      request: makeRequest("POST", { ref: "JOHN2026" }),
      params: {},
      context: {},
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/server error/i);
  });
});
