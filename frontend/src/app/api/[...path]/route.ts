import { NextRequest, NextResponse } from "next/server";

// Runtime proxy — reads BACKEND_URL at request time (not build time)
const BACKEND = () =>
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

async function proxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join("/");
  const search = req.nextUrl.search || "";
  const target = `${BACKEND()}/${path}${search}`;

  // Copy request headers, excluding host
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (key !== "host") headers.set(key, value);
  });

  let body: BodyInit | undefined;
  const method = req.method;
  if (!["GET", "HEAD"].includes(method)) {
    body = await req.blob();
  }

  try {
    const response = await fetch(target, { method, headers, body, redirect: "manual" });

    const respHeaders = new Headers();
    response.headers.forEach((value, key) => {
      // Skip hop-by-hop and encoding headers (fetch() already decompresses the body,
      // so forwarding Content-Encoding would cause ERR_CONTENT_DECODING_FAILED)
      const skip = ["connection", "transfer-encoding", "keep-alive", "content-encoding"];
      if (!skip.includes(key.toLowerCase())) {
        respHeaders.set(key, value);
      }
    });

    const respBody = await response.arrayBuffer();
    return new NextResponse(respBody, {
      status: response.status,
      headers: respHeaders,
    });
  } catch (err: any) {
    console.error(`[API proxy] Failed to proxy to ${target}:`, err.message);
    return NextResponse.json(
      { message: "Backend unavailable", error: err.message },
      { status: 502 }
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
