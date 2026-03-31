import { getBody } from "@server/lib/body";
import {
  ChangePasswordRequest,
  DeleteAccountRequest,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  SuccessResponse,
} from "@shared/schemas/index";

import { requireAuth, createSessionCookie, clearSessionCookie } from "../lib/auth";
import { stripExtension } from "../lib/params";
import {
  badRequest,
  forbidden,
  methodNotAllowed,
  notFound,
  ok,
  options,
  unauthorized,
} from "../lib/response";
import { createRouteHandlerMap } from "../lib/routing";

export default createRouteHandlerMap((ctx) => ({
  "/api/2/auth/:username/:action": {
    OPTIONS: options(["POST", "OPTIONS"]),
    GET: methodNotAllowed(),
    PUT: methodNotAllowed(),
    DELETE: methodNotAllowed(),
    async POST(req) {
      const username = req.params.username;
      const { value: action } = stripExtension(req.params.action, ["json"]);

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
                return ok(LoginResponse.parse({ success: true }), [
                  ["Set-Cookie", createSessionCookie(sessionId, isSecure)],
                ]);
              }
              // Cookie belongs to different user — ignore it and fall through to Basic auth
            }
          }
        }

        const user = await requireAuth(req, ctx.db, ctx.sessions, username);

        const sessionId = await ctx.sessions.create(user.id);

        return ok(SuccessResponse.parse({}), [
          ["Set-Cookie", createSessionCookie(sessionId, isSecure)],
        ]);
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

        return ok(SuccessResponse.parse({}), [["Set-Cookie", clearSessionCookie(isSecure)]]);
      }

      return notFound("Unknown action");
    },
  },

  "/api/b-ext/login": {
    OPTIONS: options(["POST", "OPTIONS"]),
    GET: methodNotAllowed(),
    PUT: methodNotAllowed(),
    DELETE: methodNotAllowed(),
    async POST(req) {
      const { username, password } = await getBody(req, LoginRequest);

      const user = ctx.db.first<{ id: number; password: string }>(
        "SELECT id, password FROM users WHERE name = ?",
        username,
      );

      if (!user) {
        return unauthorized("Invalid username or password", { challenge: false });
      }

      const verified = await Bun.password.verify(password, user.password);
      if (!verified) {
        return unauthorized("Invalid username or password", { challenge: false });
      }

      // Create session
      const isSecure = ctx.config.baseUrl.startsWith("https");
      const sessionId = await ctx.sessions.create(user.id);

      // Validate and return response
      return ok(LoginResponse.parse({ success: true }), [
        ["Set-Cookie", createSessionCookie(sessionId, isSecure)],
      ]);
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

      const { username, password } = await getBody(req, RegisterRequest);

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
    },
  },

  "/api/b-ext/change-password": {
    OPTIONS: options(["POST", "OPTIONS"]),
    GET: methodNotAllowed(),
    PUT: methodNotAllowed(),
    DELETE: methodNotAllowed(),
    async POST(req) {
      const user = await requireAuth(req, ctx.db, ctx.sessions);
      const { currentPassword, newPassword } = await getBody(req, ChangePasswordRequest);
      const verified = await Bun.password.verify(currentPassword, user.password);
      if (!verified) {
        return badRequest("Current password is incorrect");
      }
      const hash = await Bun.password.hash(newPassword);
      ctx.db.run("UPDATE users SET password = ? WHERE id = ?", hash, user.id);
      return ok(SuccessResponse.parse({}));
    },
  },

  "/api/b-ext/delete-account": {
    OPTIONS: options(["POST", "OPTIONS"]),
    GET: methodNotAllowed(),
    PUT: methodNotAllowed(),
    DELETE: methodNotAllowed(),
    async POST(req) {
      const user = await requireAuth(req, ctx.db, ctx.sessions);
      const { password } = await getBody(req, DeleteAccountRequest);
      const verified = await Bun.password.verify(password, user.password);
      if (!verified) {
        return badRequest("Password is incorrect");
      }
      const cookieHeader = req.headers.get("Cookie");
      if (cookieHeader) {
        const match = cookieHeader.match(/sessionid=([^;]+)/);
        if (match) {
          await ctx.sessions.delete(match[1]);
        }
      }
      ctx.db.run("DELETE FROM users WHERE id = ?", user.id);
      const isSecure = ctx.config.baseUrl.startsWith("https");
      return ok(SuccessResponse.parse({}), [["Set-Cookie", clearSessionCookie(isSecure)]]);
    },
  },
}));
