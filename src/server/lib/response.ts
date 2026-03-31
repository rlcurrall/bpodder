import { ErrorResponse } from "@shared/schemas/index";
import { z } from "zod/v4";

// All response helpers include CORS header per GPodder API spec
export const CORS = { "Access-Control-Allow-Origin": "*" };

interface ErrorOptions {
  challenge?: boolean;
}

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const innerHeaders = new Headers(headers);
  innerHeaders.set("Content-Type", "application/json");
  Object.entries(CORS).forEach(([key, value]) => innerHeaders.set(key, value));
  return new Response(JSON.stringify(data), {
    status,
    headers: innerHeaders,
  });
}

export function empty(status = 200, headers?: HeadersInit): Response {
  const innerHeaders = new Headers(headers);
  Object.entries(CORS).forEach(([key, value]) => innerHeaders.set(key, value));
  return new Response("", { status, headers: innerHeaders });
}

export function error(
  message: string | z.ZodError,
  status: number = 500,
  options: ErrorOptions = {},
  headers?: HeadersInit,
): Response {
  if (message instanceof z.ZodError) {
    const firstIssue = message.issues.at(0)?.message ?? "Validation failed";
    return error(firstIssue, 400);
  }

  const shouldChallenge = options.challenge ?? status === 401;

  // Validate error response format
  const body = ErrorResponse.parse({ code: status, message });

  const innerHeaders = new Headers(headers);
  innerHeaders.set("Content-Type", "application/json");
  Object.entries(CORS).forEach(([key, value]) => innerHeaders.set(key, value));
  if (shouldChallenge) {
    innerHeaders.set("WWW-Authenticate", 'Basic realm="bpodder"');
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: innerHeaders,
  });
}

export function opml(body: string, status = 200, headers?: HeadersInit): Response {
  const innerHeaders = new Headers(headers);
  innerHeaders.set("Content-Type", "text/x-opml; charset=utf-8");
  Object.entries(CORS).forEach(([key, value]) => innerHeaders.set(key, value));
  return new Response(body, {
    status,
    headers: innerHeaders,
  });
}

export function text(body: string, status = 200, headers?: HeadersInit): Response {
  const innerHeaders = new Headers(headers);
  innerHeaders.set("Content-Type", "text/plain; charset=utf-8");
  Object.entries(CORS).forEach(([key, value]) => innerHeaders.set(key, value));
  return new Response(body, {
    status,
    headers: innerHeaders,
  });
}

export function jsonp(
  data: unknown,
  callback: string,
  status = 200,
  headers?: HeadersInit,
): Response {
  const json = JSON.stringify(data);
  const body = `${callback}(${json})`;
  const innerHeaders = new Headers(headers);
  innerHeaders.set("Content-Type", "application/javascript; charset=utf-8");
  Object.entries(CORS).forEach(([key, value]) => innerHeaders.set(key, value));
  return new Response(body, {
    status,
    headers: innerHeaders,
  });
}

export function xml(body: string, status = 200, headers?: HeadersInit): Response {
  const innerHeaders = new Headers(headers);
  innerHeaders.set("Content-Type", "application/xml; charset=utf-8");
  Object.entries(CORS).forEach(([key, value]) => innerHeaders.set(key, value));
  return new Response(body, {
    status,
    headers: innerHeaders,
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

export function ok(body: object | string, headers?: HeadersInit): Response {
  return typeof body === "string" ? text(body, 200, headers) : json(body, 200, headers);
}

export function created(body: object | string, headers?: HeadersInit): Response {
  return typeof body === "string" ? text(body, 201, headers) : json(body, 201, headers);
}

export function accepted(body: object | string, headers?: HeadersInit): Response {
  return typeof body === "string" ? text(body, 202, headers) : json(body, 202, headers);
}

export function noContent(headers?: HeadersInit): Response {
  return empty(204, headers);
}

export function redirect(url: string, status = 302, headers?: HeadersInit): Response {
  const innerHeaders = new Headers(headers);
  innerHeaders.set("Location", url);
  Object.entries(CORS).forEach(([key, value]) => innerHeaders.set(key, value));
  return new Response(null, {
    status,
    headers: innerHeaders,
  });
}

export function badRequest(message?: string | z.ZodError, headers?: HeadersInit): Response {
  return error(message ?? "Bad request", 400, {}, headers);
}

export function unauthorized(
  message?: string,
  options?: ErrorOptions,
  headers?: HeadersInit,
): Response {
  return error(message ?? "Unauthorized", 401, options, headers);
}

export function forbidden(message?: string, headers?: HeadersInit): Response {
  return error(message ?? "Forbidden", 403, {}, headers);
}

export function notFound(message?: string, headers?: HeadersInit): Response {
  return error(message ?? "Not found", 404, {}, headers);
}

export function methodNotAllowed(message?: string, headers?: HeadersInit): Response {
  return error(message ?? "Method not allowed", 405, {}, headers);
}

export function tooManyRequests(message?: string, headers?: HeadersInit): Response {
  return error(message ?? "Too many requests", 429, {}, headers);
}

export function serverError(message?: string | z.ZodError, headers?: HeadersInit): Response {
  return error(message ?? "Internal server error", 500, {}, headers);
}
