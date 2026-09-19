import { describe, expect, it } from "vitest";

const base = process.env.PUBLIC_API_URL ?? "http://localhost:3001";

async function api(path: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, init);
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

describe("live API integration", () => {
  it("rejects unauthenticated document access", async () => {
    const health = await fetch(`${base}/health`).catch(() => null);
    if (!health?.ok) return;
    const res = await api("/api/v1/documents");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("keeps documents private between users", async () => {
    const health = await fetch(`${base}/health`).catch(() => null);
    if (!health?.ok) return;

    const recruiter = await api("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "recruiter@folio.dev", password: "RecruiterDemo123!" }),
    });
    expect(recruiter.status).toBe(200);
    const list = await api("/api/v1/documents?limit=1", {
      headers: { authorization: `Bearer ${recruiter.body.token}` },
    });
    if (!list.body.items?.[0]) return;
    const documentId = list.body.items[0].id;

    const other = await api("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "other@folio.dev", password: "OtherUser123!" }),
    });
    if (other.status !== 200) return;
    const stolen = await api(`/api/v1/documents/${documentId}`, {
      headers: { authorization: `Bearer ${other.body.token}` },
    });
    expect(stolen.status).toBe(404);
    expect(stolen.body.error.code).toBe("DOCUMENT_NOT_FOUND");
  });
});
