import type { DB } from "../db";
import type { Config } from "../config";
import type { Logger } from "../lib/logger";
import {
  requireAuth,
  type SessionStore,
  type PollTokenStore,
  createSessionCookie,
  clearSessionCookie,
} from "../lib/auth";
import { parseParam } from "../lib/params";
import { json, empty, error } from "../lib/response";
import { RegisterBody, zodError } from "../lib/schemas";
import { ZodError } from "zod";

export interface HandlerContext {
  db: DB;
  config: Config;
  sessions: SessionStore;
  pollTokens: PollTokenStore;
  logger: Logger;
}

export function createAuthHandlers(ctx: HandlerContext) {
  return {
    // /api/2/auth/:username/:action → action = "login.json" | "logout.json"
    auth: async (req: Request & { params: { username: string; action: string } }): Promise<Response> => {
      const username = req.params.username;
      const { value: action } = parseParam(req.params.action);

      if (!username || !action) {
        return error("Invalid route", 404);
      }

      if (req.method !== "POST") {
        return error("Method not allowed", 405);
      }

      const isSecure = ctx.config.baseUrl.startsWith("https");

      if (action === "login") {
        const url = new URL(req.url);
        const pollToken = url.searchParams.get("token");
        if (pollToken) {
          await ctx.pollTokens.authenticateToken(pollToken, 0);
        }

        try {
          const user = await requireAuth(req, ctx.db, ctx.sessions, username);

          if (pollToken) {
            await ctx.pollTokens.authenticateToken(pollToken, user.id);
          }

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
        const cookieHeader = req.headers.get("Cookie");
        if (cookieHeader) {
          const match = cookieHeader.match(/sessionid=([^;]+)/);
          if (match) {
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

    register: async (req: Request): Promise<Response> => {
      if (!ctx.config.enableRegistration) {
        return error("Registration is disabled", 403);
      }

      if (req.method !== "POST") {
        return error("Method not allowed", 405);
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
          username
        );
        if (existing) {
          return error("Username already exists", 400);
        }

        const passwordHash = await Bun.password.hash(password);
        ctx.db.run(
          "INSERT INTO users (name, password, token) VALUES (?, ?, NULL)",
          username,
          passwordHash
        );

        return json({});
      } catch (e) {
        if (e instanceof ZodError) {
          return zodError(e);
        }
        ctx.logger.error({ err: e }, "Registration handler error");
        return error("Invalid request body", 400);
      }
    },

    health: async (_req: Request): Promise<Response> => {
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
