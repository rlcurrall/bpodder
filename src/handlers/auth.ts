import { z } from "zod/v4";

import { requireAuth, createSessionCookie, clearSessionCookie } from "../lib/auth";
import { parseParam } from "../lib/params";
import {
  badRequest,
  error,
  forbidden,
  methodNotAllowed,
  notFound,
  ok,
  options,
  unauthorized,
} from "../lib/response";
import { createRouteHandlerMap } from "../lib/routing";
import {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  SuccessResponse,
} from "../lib/schemas/index";

export default createRouteHandlerMap((ctx) => ({
  "/api/2/auth/:username/:action": {
    OPTIONS: options(["POST", "OPTIONS"]),
    GET: methodNotAllowed(),
    PUT: methodNotAllowed(),
    DELETE: methodNotAllowed(),
    async POST(req) {
      const username = req.params.username;
      const { value: action } = parseParam(req.params.action);

      if (!username || !action) {
        return notFound("Invalid route");
      }

      const isSecure = ctx.config.baseUrl.startsWith("https");

      if (action === "login") {
        // Check for cookie-only auth (session validity check)
        const cookieHeader = req.headers.get("Cookie");
        if (cookieHeader) {
          const match = cookieHeader.match(/sessionid=([^;]+)/);
          if (match) {
            const session = await ctx.sessions.get(match[1]);
            if (session) {
              const sessionUser = ctx.db.first<{ name: string }>(
                "SELECT name FROM users WHERE id = ?",
                session.userId,
              );
              if (sessionUser && sessionUser.name === username) {
                // Valid session cookie for this user - refresh and return success
                const sessionId = await ctx.sessions.create(session.userId);
                const headers = new Headers();
                headers.set("Set-Cookie", createSessionCookie(sessionId, isSecure));
                headers.set("Content-Type", "application/json");
                headers.set("Access-Control-Allow-Origin", "*");
                return new Response(JSON.stringify({}), {
                  status: 200,
                  headers,
                });
              } else if (sessionUser && sessionUser.name !== username) {
                // Cookie username mismatch per GPodder spec
                return badRequest("Cookie username mismatch");
              }
            }
          }
        }

        const user = await requireAuth(req, ctx.db, ctx.sessions, username);

        const sessionId = await ctx.sessions.create(user.id);
        const headers = new Headers();
        headers.set("Set-Cookie", createSessionCookie(sessionId, isSecure));
        headers.set("Content-Type", "application/json");
        headers.set("Access-Control-Allow-Origin", "*");

        return new Response(JSON.stringify({}), { status: 200, headers });
      }

      if (action === "logout") {
        // Check cookie-username mismatch per GPodder spec
        const cookieHeader = req.headers.get("Cookie");
        if (cookieHeader) {
          const match = cookieHeader.match(/sessionid=([^;]+)/);
          if (match) {
            const session = await ctx.sessions.get(match[1]);
            if (session) {
              const sessionUser = ctx.db.first<{ name: string }>(
                "SELECT name FROM users WHERE id = ?",
                session.userId,
              );
              if (sessionUser && sessionUser.name !== username) {
                return badRequest("Cookie username mismatch");
              }
            }
            await ctx.sessions.delete(match[1]);
          }
        }

        const headers = new Headers();
        headers.set("Set-Cookie", clearSessionCookie(isSecure));
        headers.set("Content-Type", "application/json");
        headers.set("Access-Control-Allow-Origin", "*");

        return new Response(JSON.stringify({}), { status: 200, headers });
      }

      return notFound("Unknown action");
    },
  },

  "/health": async () => {
    try {
      ctx.db.first("SELECT 1");
      return ok({ status: "ok" });
    } catch (err) {
      ctx.logger.error({ err }, "Health check error");
      return error("Database unavailable", 503);
    }
  },

  "/api/b-ext/config": async () => {
    return ok({
      title: ctx.config.title,
      enableRegistration: ctx.config.enableRegistration,
    });
  },

  "/api/b-ext/login": {
    OPTIONS: options(["POST", "OPTIONS"]),
    GET: methodNotAllowed(),
    PUT: methodNotAllowed(),
    DELETE: methodNotAllowed(),
    async POST(req) {
      try {
        const body = await req.json();
        const { username, password } = LoginRequest.parse(body);

        const user = ctx.db.first<{ id: number; password: string }>(
          "SELECT id, password FROM users WHERE name = ?",
          username,
        );

        if (!user) {
          return unauthorized("Invalid username or password");
        }

        const verified = await Bun.password.verify(password, user.password);
        if (!verified) {
          return unauthorized("Invalid username or password");
        }

        // Create session
        const isSecure = ctx.config.baseUrl.startsWith("https");
        const sessionId = await ctx.sessions.create(user.id);
        const headers = new Headers();
        headers.set("Set-Cookie", createSessionCookie(sessionId, isSecure));
        headers.set("Content-Type", "application/json");
        headers.set("Access-Control-Allow-Origin", "*");

        // Validate and return response
        const response = LoginResponse.parse({ success: true });
        return new Response(JSON.stringify(response), { status: 200, headers });
      } catch (e) {
        ctx.logger.error({ err: e }, "UI login handler error");
        return badRequest(e instanceof z.ZodError ? e : "Invalid request body");
      }
    },
  },

  "/api/b-ext/register": {
    OPTIONS: options(["POST", "OPTIONS"]),
    GET: methodNotAllowed(),
    PUT: methodNotAllowed(),
    DELETE: methodNotAllowed(),
    async POST(req) {
      if (!ctx.config.enableRegistration) {
        return forbidden("Registration is disabled");
      }

      try {
        const rawBody = await req.json();
        const parseResult = RegisterRequest.safeParse(rawBody);

        if (!parseResult.success) {
          return badRequest(parseResult.error);
        }

        const { username, password } = parseResult.data;

        const existing = ctx.db.first<{ id: number }>(
          "SELECT id FROM users WHERE name = ?",
          username,
        );
        if (existing) {
          return badRequest("Username already exists");
        }

        const passwordHash = await Bun.password.hash(password);
        ctx.db.run("INSERT INTO users (name, password) VALUES (?, ?)", username, passwordHash);

        return ok(SuccessResponse.parse({}));
      } catch (e) {
        if (e instanceof z.ZodError) {
          return badRequest(e);
        }
        ctx.logger.error({ err: e }, "Registration handler error");
        return badRequest("Invalid request body");
      }
    },
  },
}));
