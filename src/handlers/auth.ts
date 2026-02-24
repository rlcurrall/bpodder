import { requireAuth, createSessionCookie, clearSessionCookie } from "../lib/auth";
import { parseParam } from "../lib/params";
import { json, error } from "../lib/response";
import { RegisterBody, zodError } from "../lib/schemas";
import { ZodError } from "zod";

export function createAuthHandlers(ctx: AppContext): {
  auth: RouteDefinition<"/api/2/auth/:username/:action">;
  register: RouteDefinition<"/register">;
  health: RouteHandler<"/health">;
} {
  return {
    // /api/2/auth/:username/:action → action = "login.json" | "logout.json"
    auth: {
      async GET() {
        // GET not allowed on auth endpoints per GPodder spec
        return error("Method not allowed", 405);
      },
      async POST(req) {
        const username = req.params.username;
        const { value: action } = parseParam(req.params.action);

        if (!username || !action) {
          return error("Invalid route", 404);
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
                  return error("Cookie username mismatch", 400);
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
            return error("Authentication failed", 401);
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
                  return error("Cookie username mismatch", 400);
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

        return error("Unknown action", 404);
      },
    },

    register: {
      async POST(req) {
        if (!ctx.config.enableRegistration) {
          return error("Registration is disabled", 403);
        }

        try {
          const rawBody = await req.json();
          const parseResult = RegisterBody.safeParse(rawBody);

          if (!parseResult.success) {
            return zodError(parseResult.error);
          }

          const { username, password } = parseResult.data;

          const existing = ctx.db.first<{ id: number }>(
            "SELECT id FROM users WHERE name = ?",
            username,
          );
          if (existing) {
            return error("Username already exists", 400);
          }

          const passwordHash = await Bun.password.hash(password);
          ctx.db.run("INSERT INTO users (name, password) VALUES (?, ?)", username, passwordHash);

          return json({});
        } catch (e) {
          if (e instanceof ZodError) {
            return zodError(e);
          }
          ctx.logger.error({ err: e }, "Registration handler error");
          return error("Invalid request body", 400);
        }
      },
    },

    async health() {
      try {
        ctx.db.first("SELECT 1");
        return json({ status: "ok" });
      } catch (e) {
        ctx.logger.error({ err: e }, "Health check error");
        return error("Database unavailable", 503);
      }
    },
  };
}
