// All response helpers include CORS header per GPodder API spec
export const CORS = { "Access-Control-Allow-Origin": "*" };

export const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

export const empty = (status = 200): Response =>
  new Response("", { status, headers: CORS });

export const error = (message: string, status: number): Response =>
  new Response(JSON.stringify({ code: status, message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS,
      ...(status === 401 ? { "WWW-Authenticate": 'Basic realm="bpodder"' } : {}),
    },
  });

export const opml = (body: string, status = 200): Response =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/x-opml; charset=utf-8", ...CORS },
  });

export const text = (body: string, status = 200): Response =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...CORS },
  });

export function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}
