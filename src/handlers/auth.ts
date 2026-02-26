import z4 from "zod/v4";

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
import { RegisterBody } from "../lib/schemas";

export function createAuthHandlers(ctx: AppContext): {
  auth: RouteDefinition<"/api/2/auth/:username/:action">;
  register: RouteDefinition<"/register">;
  health: RouteDefinition<"/health">;
  uiConfig: RouteDefinition<"/api/ui/config">;
} {
  return {
    // /api/2/auth/:username/:action → action = "login.json" | "logout.json"
    auth: {
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

          try {
            const user = await requireAuth(req, ctx.db, ctx.sessions, username);

            const sessionId = await ctx.sessions.create(user.id);
            const headers = new Headers();
            headers.set("Set-Cookie", createSessionCookie(sessionId, isSecure));
            headers.set("Content-Type", "application/json");
            headers.set("Access-Control-Allow-Origin", "*");

            return new Response(JSON.stringify({}), { status: 200, headers });
          } catch (e) {
            if (e instanceof Response) return e;
            ctx.logger.error({ err: e }, "Login handler error");
            return unauthorized("Authentication failed");
          }
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

    register: {
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
          const parseResult = RegisterBody.safeParse(rawBody);

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

          return ok({});
        } catch (e) {
          if (e instanceof z4.ZodError) {
            return badRequest(e);
          }
          ctx.logger.error({ err: e }, "Registration handler error");
          return badRequest("Invalid request body");
        }
      },
    },

    async health() {
      try {
        ctx.db.first("SELECT 1");
        return ok({ status: "ok" });
      } catch (err) {
        ctx.logger.error({ err }, "Health check error");
        return error("Database unavailable", 503);
      }
    },

    async uiConfig() {
      return ok({
        title: ctx.config.title,
        enableRegistration: ctx.config.enableRegistration,
      });
    },
  };
}
