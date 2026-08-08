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

const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";
const ACCESS_MAX_AGE = 60 * 60 * 24;      // сутки — переживает закрытие вкладки
const REFRESH_MAX_AGE = 60 * 60 * 24 * 7; // совпадает с REFRESH_EXPIRES_IN

/**
 * Прокси между браузером и API.
 *
 * Здесь же живёт вся работа с токенами. Смысл: браузерный JavaScript их
 * не видит вовсе — куки httpOnly, а заголовок Authorization подставляет
 * этот обработчик на сервере. При межсайтовом скриптинге украсть токен
 * из document.cookie становится невозможно.
 *
 * Бэкенд при этом остаётся на Bearer-токенах: он ничего не знает про куки,
 * поэтому интеграции и тесты работают с ним напрямую как прежде.
 *
 * Реализация на встроенных http/https, а не на fetch: в production-сборке
 * Next подменяет глобальный fetch, и тот бросает UND_ERR_NOT_SUPPORTED при
 * пересылке тела запроса.
 */
async function proxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join("/");
  const search = req.nextUrl.search || "";
  const target = new URL(`${BACKEND()}/${path}${search}`);

  const isLogin = path === "auth/login";
  const isRefresh = path === "auth/refresh";
  const isLogout = path === "auth/logout";

  // Forward request headers, dropping host + hop-by-hop/length headers
  const dropReqHeaders = ["host", "connection", "content-length", "transfer-encoding", "keep-alive"];
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    if (!dropReqHeaders.includes(key.toLowerCase())) headers[key] = value;
  });

  // Подставляем токен из httpOnly-куки. Клиент его прислать не может —
  // он о нём не знает.
  const accessToken = req.cookies.get(ACCESS_COOKIE)?.value;
  if (accessToken && !headers["authorization"]) {
    headers["authorization"] = `Bearer ${accessToken}`;
  }

  const method = req.method;
  let bodyBuf =
    method === "GET" || method === "HEAD"
      ? undefined
      : Buffer.from(await req.arrayBuffer());

  // Обновление токена: refresh лежит в httpOnly-куке, клиент присылает пустое тело
  if (isRefresh) {
    const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
    if (!refreshToken) {
      return NextResponse.json({ message: "Сессия не найдена, войдите заново" }, { status: 401 });
    }
    bodyBuf = Buffer.from(JSON.stringify({ refreshToken }));
    headers["content-type"] = "application/json";
  }

  const client = target.protocol === "https:" ? https : http;
  // secure только под HTTPS: иначе браузер не примет куку на http://localhost
  const isHttps = (req.headers.get("x-forwarded-proto") || req.nextUrl.protocol).startsWith("https");

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
            let payload: Buffer | null = nullBody ? null : Buffer.concat(chunks);

            // Ответы входа и обновления содержат токены. Забираем их в
            // httpOnly-куки и вырезаем из тела: браузеру они не нужны,
            // а в localStorage или обычной куке их можно украсть.
            let tokens: { accessToken?: string; refreshToken?: string } | null = null;
            if ((isLogin || isRefresh) && status === 200 && payload && !res.headers["content-encoding"]) {
              try {
                const parsed = JSON.parse(payload.toString("utf8"));
                if (parsed?.accessToken) {
                  tokens = { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
                  delete parsed.accessToken;
                  delete parsed.refreshToken;
                  payload = Buffer.from(JSON.stringify(parsed));
                  respHeaders.delete("content-length");
                }
              } catch {
                // Не JSON — оставляем тело как есть
              }
            }

            // Приведение типа: Buffer во время выполнения является Uint8Array и
            // корректно отдаётся как тело, но в типах BodyInit его нет.
            // Важно передавать именно двоичные данные — через прокси идут файлы.
            const response = new NextResponse(payload as unknown as BodyInit | null, {
              status,
              headers: respHeaders,
            });

            if (tokens?.accessToken) {
              const base = { httpOnly: true, sameSite: "strict" as const, secure: isHttps, path: "/" };
              response.cookies.set(ACCESS_COOKIE, tokens.accessToken, { ...base, maxAge: ACCESS_MAX_AGE });
              if (tokens.refreshToken) {
                response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, { ...base, maxAge: REFRESH_MAX_AGE });
              }
            }
            if (isLogout || (isRefresh && status === 401)) {
              // Выход или протухший refresh — чистим обе куки
              response.cookies.delete(ACCESS_COOKIE);
              response.cookies.delete(REFRESH_COOKIE);
            }

            resolve(response);
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
