import { NextRequest, NextResponse } from "next/server";
import http from "node:http";
import https from "node:https";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Runtime proxy — reads BACKEND_URL at request time (not build time)
const BACKEND = () =>
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

// NOTE: this proxy uses Node's built-in http/https modules instead of fetch().
// In a Next.js production build the global fetch is patched for caching and
// throws UND_ERR_NOT_SUPPORTED when forwarding a request body, so we bypass it.
async function proxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join("/");
  const search = req.nextUrl.search || "";
  const target = new URL(`${BACKEND()}/${path}${search}`);

  // Forward request headers, dropping host + hop-by-hop/length headers
  const dropReqHeaders = ["host", "connection", "content-length", "transfer-encoding", "keep-alive"];
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    if (!dropReqHeaders.includes(key.toLowerCase())) headers[key] = value;
  });

  const method = req.method;
  const bodyBuf =
    method === "GET" || method === "HEAD"
      ? undefined
      : Buffer.from(await req.arrayBuffer());

  const client = target.protocol === "https:" ? https : http;

  return new Promise<NextResponse>((resolve) => {
    const upstream = client.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: target.pathname + target.search,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            const respHeaders = new Headers();
            for (const [key, value] of Object.entries(res.headers)) {
              // Skip hop-by-hop / encoding headers (body is forwarded as-is here,
              // so content-encoding stays valid; transfer/connection must not leak)
              const skip = ["connection", "transfer-encoding", "keep-alive"];
              if (value === undefined || skip.includes(key.toLowerCase())) continue;
              respHeaders.set(key, Array.isArray(value) ? value.join(", ") : value);
            }
            const status = res.statusCode || 502;
            // null-body statuses (304 Not Modified on conditional requests, 204, etc.)
            // must NOT carry a body — the Response constructor throws otherwise, which
            // previously left this Promise unresolved and hung the request.
            const nullBody = [101, 204, 205, 304].includes(status);
            resolve(
              new NextResponse(nullBody ? null : Buffer.concat(chunks), {
                status,
                headers: respHeaders,
              })
            );
          } catch (e: any) {
            console.error(`[API proxy] Failed to build response for ${target.href}:`, e.message);
            resolve(
              NextResponse.json({ message: "Proxy response error", error: e.message }, { status: 502 })
            );
          }
        });
      }
    );

    upstream.on("error", (err: any) => {
      console.error(`[API proxy] Failed to proxy to ${target.href}:`, err.message);
      resolve(
        NextResponse.json(
          { message: "Backend unavailable", error: err.message },
          { status: 502 }
        )
      );
    });

    if (bodyBuf) upstream.write(bodyBuf);
    upstream.end();
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
