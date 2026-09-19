import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const backend = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001").replace(
  "://localhost",
  "://127.0.0.1",
);

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(req: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const target = `${backend}/api/v1/${path.join("/")}${new URL(req.url).search}`;
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("accept-encoding");

  try {
    const res = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer(),
      cache: "no-store",
      redirect: "manual",
    });
    const out = new Headers(res.headers);
    out.delete("transfer-encoding");
    out.delete("connection");
    return new NextResponse(res.body, { status: res.status, headers: out });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "NETWORK_UNAVAILABLE",
          message: "The API could not be reached. Confirm the Folio API is running, then retry.",
        },
      },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
