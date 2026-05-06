import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  HeadersFunction,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { createAffiliate, updateAffiliate } from "~/services/affiliate.service";
import prisma from "~/db.server";


function TestUsageButton() {
  const [result, setResult] = useState("");

  async function testUsage() {
    try {
      const res = await fetch("/apps/affiliate-engine/api/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: "TEST-123",
        }),
      });

      const text = await res.text();
      setResult(text);
    } catch (err) {
      setResult("Error: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  return (
    <div style={{ marginTop: "20px" }}>
      <button
        onClick={testUsage}
        style={{
          padding: "10px 16px",
          background: "#000",
          color: "#fff",
          borderRadius: "6px",
          cursor: "pointer",
        }}
      >
        Test /api/usage
      </button>

      {result && (
        <pre
          style={{
            marginTop: "20px",
            padding: "12px",
            background: "#f4f4f4",
            borderRadius: "6px",
            whiteSpace: "pre-wrap",
          }}
        >
          {result}
        </pre>
      )}
    </div>
  );
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const affiliates = await prisma.affiliate.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { clicks: true, conversions: true } },
      conversions: {
        select: { totalAmount: true, commissionAffiliate: true },
      },
    },
  });

  const data = affiliates.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    commissionRate: a.commissionRate,
    isActive: a.isActive,
    createdAt: a.createdAt.toISOString(),
    clicks: a._count.clicks,
    conversions: a._count.conversions,
    revenue: a.conversions.reduce((s, c) => s + c.totalAmount, 0),
    commission: a.conversions.reduce((s, c) => s + c.commissionAffiliate, 0),
  }));

  const totals = {
    affiliates: data.length,
    clicks: data.reduce((s, a) => s + a.clicks, 0),
    conversions: data.reduce((s, a) => s + a.conversions, 0),
    revenue: data.reduce((s, a) => s + a.revenue, 0),
    commission: data.reduce((s, a) => s + a.commission, 0),
  };

  return { affiliates: data, totals };
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "create") {
    const code = String(formData.get("code") || "").trim();
    const commissionRate = Number(formData.get("commissionRate") || 0);
    const name = String(formData.get("name") || "").trim() || null;

    if (!code) return { error: "Affiliate code is required" };
    if (!commissionRate || commissionRate < 1 || commissionRate > 100) {
      return { error: "Commission rate must be between 1 and 100" };
    }

    try {
      const affiliate = await createAffiliate({ code, commissionRate, name });
      return { affiliate, intent: "create" };
    } catch {
      return { error: `Code "${code.toUpperCase()}" already exists` };
    }
  }

  if (intent === "delete") {
    const id = String(formData.get("id") || "");
    if (!id) return { error: "Missing ID" };

    // Delete children before parent to satisfy FK constraints
    await prisma.click.deleteMany({ where: { affiliateId: id } });
    await prisma.conversion.deleteMany({ where: { affiliateId: id } });
    await prisma.affiliate.delete({ where: { id } });

    return { deleted: true, intent: "delete" };
  }

  if (intent === "toggle") {
    const id = String(formData.get("id") || "");
    const isActive = formData.get("isActive") === "true";
    if (!id) return { error: "Missing ID" };

    await updateAffiliate(id, { isActive: !isActive });
    return { updated: true, intent: "toggle" };
  }

  return { error: "Unknown action" };
};

// ─── UI ───────────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#f6f6f7",
  padding: "16px",
  borderRadius: "8px",
  textAlign: "center",
};

const statNum: React.CSSProperties = {
  fontSize: "28px",
  fontWeight: "700",
  color: "#202223",
};

const statLabel: React.CSSProperties = {
  fontSize: "13px",
  color: "#6d7175",
  marginTop: "4px",
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontWeight: "600",
  fontSize: "13px",
  borderBottom: "2px solid #e1e3e5",
  whiteSpace: "nowrap",
};

const thR: React.CSSProperties = { ...th, textAlign: "right" };
const thC: React.CSSProperties = { ...th, textAlign: "center" };

const td: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: "14px",
  borderBottom: "1px solid #e1e3e5",
  verticalAlign: "middle",
};

const tdR: React.CSSProperties = { ...td, textAlign: "right" };
const tdC: React.CSSProperties = { ...td, textAlign: "center" };

const input: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: "6px",
  border: "1px solid #c9cccf",
  fontSize: "14px",
  boxSizing: "border-box",
};

export default function Index() {
  const fetcher = useFetcher<typeof action>();
  const { affiliates, totals } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const [shopHost, setShopHost] = useState("");

  const isCreating =
    fetcher.state !== "idle" &&
    (fetcher.formData?.get("intent") as string) === "create";

  useEffect(() => {
    if (typeof window !== "undefined") {
      setShopHost(window.location.hostname);
    }
  }, []);

  useEffect(() => {
    if (!fetcher.data) return;
    if ("affiliate" in fetcher.data && fetcher.data.affiliate) {
      shopify.toast.show("Affiliate created successfully");
    } else if ("deleted" in fetcher.data && fetcher.data.deleted) {
      shopify.toast.show("Affiliate deleted");
    } else if ("updated" in fetcher.data && fetcher.data.updated) {
      shopify.toast.show("Status updated");
    } else if ("error" in fetcher.data && fetcher.data.error) {
      shopify.toast.show(String(fetcher.data.error), { isError: true });
    }
  }, [fetcher.data, shopify]);

  return (
    <s-page heading="Affiliate Dashboard">

      {/* ── Stats Overview ── */}
      <s-section heading="Overview">
        <TestUsageButton />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "12px",
          }}
        >
          <div style={card}>
            <div style={statNum}>{totals.affiliates}</div>
            <div style={statLabel}>Affiliates</div>
          </div>
          <div style={card}>
            <div style={statNum}>{totals.clicks}</div>
            <div style={statLabel}>Total Clicks</div>
          </div>
          <div style={card}>
            <div style={statNum}>{totals.conversions}</div>
            <div style={statLabel}>Conversions</div>
          </div>
          <div style={card}>
            <div style={statNum}>${totals.revenue.toFixed(2)}</div>
            <div style={statLabel}>Total Revenue</div>
          </div>
          <div style={card}>
            <div style={{ ...statNum, color: "#008060" }}>
              ${totals.commission.toFixed(2)}
            </div>
            <div style={statLabel}>Total Commission</div>
          </div>
        </div>
      </s-section>

      {/* ── Create Affiliate ── */}
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="create" />
        <s-section heading="Add New Affiliate">
          <div
            style={{
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
              alignItems: "flex-end",
            }}
          >
            <div style={{ flex: "1", minWidth: "140px" }}>
  <label
    htmlFor="affiliate-code"
    style={{
      display: "block",
      marginBottom: "6px",
      fontWeight: "500",
      fontSize: "13px",
    }}
  >
    Affiliate Code *
  </label>
  <input
    id="affiliate-code"
    name="code"
    placeholder="e.g. JOHN2026"
    required
    style={input}
  />
</div>

<div style={{ flex: "1", minWidth: "140px" }}>
  <label
    htmlFor="affiliate-name"
    style={{
      display: "block",
      marginBottom: "6px",
      fontWeight: "500",
      fontSize: "13px",
    }}
  >
    Name
  </label>
  <input
    id="affiliate-name"
    name="name"
    placeholder="Affiliate name"
    style={input}
  />
</div>

<div style={{ width: "160px" }}>
  <label
    htmlFor="commission-rate"
    style={{
      display: "block",
      marginBottom: "6px",
      fontWeight: "500",
      fontSize: "13px",
    }}
  >
    Commission Rate (%) *
  </label>
  <input
    id="commission-rate"
    name="commissionRate"
    type="number"
    min="1"
    max="100"
    step="0.5"
    placeholder="e.g. 15"
    required
    style={input}
  />
</div>

            <div>
              <s-button type="submit" loading={isCreating}>
                Create Affiliate
              </s-button>
            </div>
          </div>
          {"error" in (fetcher.data ?? {}) && (
            <p style={{ color: "#d82c0d", marginTop: "8px", fontSize: "13px" }}>
              {(fetcher.data as { error: string }).error}
            </p>
          )}
        </s-section>
      </fetcher.Form>

      {/* ── Affiliates Table ── */}
      <s-section heading={`Affiliates (${affiliates.length})`}>
        {affiliates.length === 0 ? (
          <p
            style={{
              color: "#6d7175",
              textAlign: "center",
              padding: "40px 0",
            }}
          >
            No affiliates yet. Create your first one above!
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Code / Link</th>
                  <th style={th}>Name</th>
                  <th style={thR}>Rate</th>
                  <th style={thR}>Clicks</th>
                  <th style={thR}>Conversions</th>
                  <th style={thR}>Revenue</th>
                  <th style={thR}>Commission</th>
                  <th style={thC}>Status</th>
                  <th style={thC}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {affiliates.map((a) => (
                  <tr key={a.id}>
                    <td style={td}>
                      <strong style={{ fontFamily: "monospace", fontSize: "13px" }}>
                        {a.code}
                      </strong>
                      {shopHost && (
                        <div
                          style={{
                            fontSize: "11px",
                            color: "#8c9196",
                            marginTop: "3px",
                          }}
                        >
                          {shopHost}/?ref={a.code}
                        </div>
                      )}
                    </td>
                    <td style={td}>{a.name ?? "—"}</td>
                    <td style={tdR}>
                      <span
                        style={{
                          background: "#e3f1df",
                          color: "#1a7a3c",
                          padding: "2px 8px",
                          borderRadius: "12px",
                          fontSize: "12px",
                          fontWeight: "600",
                        }}
                      >
                        {a.commissionRate}%
                      </span>
                    </td>
                    <td style={tdR}>
                      <strong>{a.clicks}</strong>
                    </td>
                    <td style={tdR}>
                      <strong>{a.conversions}</strong>
                    </td>
                    <td style={tdR}>${a.revenue.toFixed(2)}</td>
                    <td style={{ ...tdR, color: "#008060", fontWeight: "600" }}>
                      ${a.commission.toFixed(2)}
                    </td>
                    <td style={tdC}>
                      <fetcher.Form method="post" style={{ display: "inline" }}>
                        <input type="hidden" name="intent" value="toggle" />
                        <input type="hidden" name="id" value={a.id} />
                        <input
                          type="hidden"
                          name="isActive"
                          value={String(a.isActive)}
                        />
                        <button
                          type="submit"
                          style={{
                            background: a.isActive ? "#e3f1df" : "#fde8e6",
                            color: a.isActive ? "#1a7a3c" : "#d82c0d",
                            border: "none",
                            padding: "4px 10px",
                            borderRadius: "12px",
                            cursor: "pointer",
                            fontSize: "12px",
                            fontWeight: "500",
                          }}
                        >
                          {a.isActive ? "Active" : "Inactive"}
                        </button>
                      </fetcher.Form>
                    </td>
                    <td style={tdC}>
                      <fetcher.Form
                        method="post"
                        style={{ display: "inline" }}
                        onSubmit={(e) => {
                          if (
                            !window.confirm(
                              `Delete affiliate "${a.code}"? This will remove all related clicks and conversions.`,
                            )
                          ) {
                            e.preventDefault();
                          }
                        }}
                      >
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="id" value={a.id} />
                        <button
                          type="submit"
                          style={{
                            background: "none",
                            border: "1px solid #e1e3e5",
                            padding: "4px 10px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            color: "#d82c0d",
                            fontSize: "12px",
                          }}
                        >
                          Delete
                        </button>
                      </fetcher.Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </s-section>

    </s-page>
  );
}

export const headers: HeadersFunction = (args) => {
  return boundary.headers(args);
};
