import z4 from "zod/v4";

// All response helpers include CORS header per GPodder API spec
export const CORS = { "Access-Control-Allow-Origin": "*" };

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export function empty(status = 200): Response {
  return new Response("", { status, headers: CORS });
}

export function error(message: string | z4.ZodError, status: number = 500): Response {
  if (message instanceof z4.ZodError) {
    const firstIssue = message.issues.at(0)?.message ?? "Validation failed";
    return error(firstIssue, 400);
  }

  return new Response(JSON.stringify({ code: status, message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS,
      ...(status === 401 ? { "WWW-Authenticate": 'Basic realm="bpodder"' } : {}),
    },
  });
}

export function opml(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/x-opml; charset=utf-8", ...CORS },
  });
}

export function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...CORS },
  });
}

export function options(methods: Bun.Serve.HTTPMethod[] = []): Response {
  const allow = methods.length > 0 ? methods.join(", ") : "GET, POST, PUT, DELETE, OPTIONS";
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": allow,
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}

export function ok(body: object | string): Response {
  return typeof body === "string" ? text(body) : json(body);
}

export function created(body: object | string): Response {
  return typeof body === "string" ? text(body, 201) : json(body, 201);
}

export function accepted(body: object | string): Response {
  return typeof body === "string" ? text(body, 202) : json(body, 202);
}

export function noContent(): Response {
  return empty(204);
}

export function redirect(url: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: {
      Location: url,
      ...CORS,
    },
  });
}

export function badRequest(message?: string | z4.ZodError): Response {
  return error(message ?? "Bad request", 400);
}

export function unauthorized(message?: string): Response {
  return error(message ?? "Unauthorized", 401);
}

export function forbidden(message?: string): Response {
  return error(message ?? "Forbidden", 403);
}

export function notFound(message?: string): Response {
  return error(message ?? "Not found", 404);
}

export function methodNotAllowed(message?: string): Response {
  return error(message ?? "Method not allowed", 405);
}

export function tooManyRequests(message?: string): Response {
  return error(message ?? "Too many requests", 429);
}

export function serverError(message?: string | z4.ZodError): Response {
  return error(message ?? "Internal server error", 500);
}
