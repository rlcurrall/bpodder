import { json, error } from "../lib/response";
import { requireAuth, type SessionStore } from "../lib/auth";
import { parseParam } from "../lib/params";
import type { DB } from "../db";
import type { Config } from "../config";
import type { Logger } from "../lib/logger";
import {
  SubscriptionChangeBody,
  EpisodePostBody,
  EpisodeAction,
  zodError,
} from "../lib/schemas";
import { ZodError } from "zod";

interface HandlerContext {
  db: DB;
  config: Config;
  sessions: SessionStore;
  logger: Logger;
}

export function createNextCloudHandlers(ctx: HandlerContext) {
  return {
    ncLoginInit: async (req: Request): Promise<Response> => {
      if (req.method !== "POST") {
        return error("Method not allowed", 405);
      }

      try {
        const token = crypto.randomUUID();
        const tokenHash = await hashToken(token);
        const now = Math.floor(Date.now() / 1000);
        const expiresAt = now + 20 * 60; // 20 minutes

        ctx.db.run(
          "INSERT INTO poll_tokens (token_hash, user_id, created_at, expires_at, attempts) VALUES (?, NULL, ?, ?, 0)",
          tokenHash,
          now,
          expiresAt
        );

        const baseUrl = ctx.config.baseUrl || `${new URL(req.url).origin}`;

        return json({
          poll: {
            token,
            endpoint: `${baseUrl}/index.php/login/v2/poll`,
          },
          login: `${baseUrl}/login?token=${encodeURIComponent(token)}`,
        });
      } catch (e) {
        ctx.logger.error({ err: e }, "NextCloud login init handler error");
          return error("Server error", 500);
      }
    },

    ncLoginPoll: async (req: Request): Promise<Response> => {
      if (req.method !== "POST") {
        return error("Method not allowed", 405);
      }

      try {
        const body = await req.text();
        const params = new URLSearchParams(body);
        const token = params.get("token");

        if (!token) {
          return error("Missing token", 404);
        }

        const tokenHash = await hashToken(token);
        const now = Math.floor(Date.now() / 1000);

        const row = ctx.db.first<{
          user_id: number | null;
          expires_at: number;
          attempts: number;
        }>(
          "SELECT user_id, expires_at, attempts FROM poll_tokens WHERE token_hash = ?",
          tokenHash
        );

        if (!row) {
          return error("Invalid token", 404);
        }

        if (row.expires_at < now) {
          ctx.db.run("DELETE FROM poll_tokens WHERE token_hash = ?", tokenHash);
          return error("Token expired", 404);
        }

        if (row.user_id === null) {
          const newAttempts = row.attempts + 1;
          if (newAttempts >= 10) {
            ctx.db.run("DELETE FROM poll_tokens WHERE token_hash = ?", tokenHash);
          } else {
            ctx.db.run(
              "UPDATE poll_tokens SET attempts = ? WHERE token_hash = ?",
              newAttempts,
              tokenHash
            );
          }
          return error("Not authenticated", 404);
        }

        const user = ctx.db.first<{ name: string; password: string }>(
          "SELECT name, password FROM users WHERE id = ?",
          row.user_id
        );

        if (!user) {
          return error("User not found", 404);
        }

        ctx.db.run("DELETE FROM poll_tokens WHERE token_hash = ?", tokenHash);

        const encoder = new TextEncoder();
        const data = encoder.encode(user.password + token);
        const hashBuffer = await crypto.subtle.digest("SHA-1", data);
        const hashHex = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        const appPassword = `${token}:${hashHex}`;

        const baseUrl = ctx.config.baseUrl || `${new URL(req.url).origin}`;

        return json({
          server: baseUrl,
          loginName: user.name,
          appPassword,
        });
      } catch (e) {
        ctx.logger.error({ err: e }, "NextCloud login poll handler error");
        return error("Server error", 500);
      }
    },

    ncSubscriptions: async (req: Request): Promise<Response> => {
      try {
        const user = await requireAuth(req, ctx.db, ctx.sessions);

        const url = new URL(req.url);
        const since = parseInt(url.searchParams.get("since") ?? "0", 10) || 0;

        const subs = ctx.db.all<{
          url: string;
          deleted: number;
          changed: number;
        }>(
          `SELECT url, deleted, changed FROM subscriptions 
           WHERE user = ? AND changed >= ?`,
          user.id,
          since
        );

        const add: string[] = [];
        const remove: string[] = [];

        for (const sub of subs) {
          if (sub.deleted) {
            remove.push(sub.url);
          } else {
            add.push(sub.url);
          }
        }

        return json({ add, remove });
      } catch (e) {
        if (e instanceof Response) return e;
        ctx.logger.error({ err: e }, "NextCloud subscriptions handler error");
        return error("Server error", 500);
      }
    },

    ncSubscriptionChange: async (req: Request): Promise<Response> => {
      if (req.method !== "POST") {
        return error("Method not allowed", 405);
      }

      try {
        const user = await requireAuth(req, ctx.db, ctx.sessions);
        const rawBody = await req.json();
        const parseResult = SubscriptionChangeBody.safeParse(rawBody);

        if (!parseResult.success) {
          return zodError(parseResult.error);
        }

        const { add: addList, remove: removeList } = parseResult.data;
        const timestamp = Math.floor(Date.now() / 1000);

        ctx.db.transaction(() => {
          for (const url of addList) {
            const existing = ctx.db.first<{ id: number; deleted: number }>(
              "SELECT id, deleted FROM subscriptions WHERE user = ? AND url = ?",
              user.id,
              url
            );

            if (existing) {
              if (existing.deleted) {
                ctx.db.run(
                  "UPDATE subscriptions SET deleted = 0, changed = ? WHERE id = ?",
                  timestamp,
                  existing.id
                );
              }
            } else {
              ctx.db.run(
                "INSERT INTO subscriptions (user, feed, url, deleted, changed, data) VALUES (?, NULL, ?, 0, ?, NULL)",
                user.id,
                url,
                timestamp
              );
            }
          }

          for (const url of removeList) {
            ctx.db.run(
              "UPDATE subscriptions SET deleted = 1, changed = ? WHERE user = ? AND url = ?",
              timestamp,
              user.id,
              url
            );
          }
        });

        return json({});
      } catch (e) {
        if (e instanceof Response) return e;
        if (e instanceof ZodError) {
          return zodError(e);
        }
        ctx.logger.error({ err: e }, "NextCloud subscription change handler error");
        return error("Server error", 500);
      }
    },

    ncEpisodes: async (req: Request): Promise<Response> => {
      try {
        const user = await requireAuth(req, ctx.db, ctx.sessions);

        if (req.method === "GET") {
          const url = new URL(req.url);
          const since = parseInt(url.searchParams.get("since") ?? "0", 10) || 0;

          const rows = ctx.db.all<{
            url: string;
            action: string;
            changed: number;
            position: number | null;
            started: number | null;
            total: number | null;
            data: string | null;
          }>(
            `SELECT 
              ea.url,
              ea.action,
              ea.changed,
              ea.position,
              ea.started,
              ea.total,
              ea.data
            FROM episodes_actions ea
            WHERE ea.user = ? AND ea.changed >= ?
            ORDER BY ea.changed`,
            user.id,
            since
          );

          const actions = rows.map((row) => {
            const action: Record<string, unknown> = {
              podcast: "",
              episode: row.url,
              action: row.action,
              timestamp: new Date(row.changed * 1000)
                .toISOString()
                .replace(/\.\d{3}Z$/, "Z"),
            };

            if (row.position !== null) action.position = row.position;
            if (row.started !== null) action.started = row.started;
            if (row.total !== null) action.total = row.total;

            if (row.data) {
              try {
                const data = JSON.parse(row.data);
                Object.assign(action, data);
              } catch {
                // ignore
              }
            }

            return action;
          });

          const timestamp = Math.floor(Date.now() / 1000);

          return json({ timestamp, actions });
        }

        if (req.method === "POST") {
          const rawBody = await req.json();

          // Extract actions array without full validation (per-item validation in loop)
          let rawActions: unknown[];
          if (Array.isArray(rawBody)) {
            rawActions = rawBody;
          } else if (
            rawBody &&
            typeof rawBody === "object" &&
            "actions" in rawBody &&
            Array.isArray(rawBody.actions)
          ) {
            rawActions = rawBody.actions;
          } else {
            return error("Expected array or { actions: [...] }", 400);
          }

          const timestamp = Math.floor(Date.now() / 1000);

          ctx.db.transaction(() => {
            for (const rawAction of rawActions) {
              // Per-item validation with silent skip on failure (preserves existing behavior)
              const actionResult = EpisodeAction.safeParse(rawAction);
              if (!actionResult.success) continue;

              const action = actionResult.data;
              const podcastUrl = action.podcast || "";
              const episodeUrl = action.episode;
              const actionType = action.action;

              let subscription = ctx.db.first<{ id: number }>(
                "SELECT id FROM subscriptions WHERE user = ? AND url = ? AND deleted = 0",
                user.id,
                podcastUrl
              );

              if (!subscription && podcastUrl) {
                ctx.db.run(
                  "INSERT INTO subscriptions (user, feed, url, deleted, changed, data) VALUES (?, NULL, ?, 0, ?, NULL)",
                  user.id,
                  podcastUrl,
                  timestamp
                );
                subscription = ctx.db.first<{ id: number }>(
                  "SELECT id FROM subscriptions WHERE user = ? AND url = ?",
                  user.id,
                  podcastUrl
                );
              }

              let deviceId: number | null = null;
              if (action.device) {
                const device = ctx.db.first<{ id: number }>(
                  "SELECT id FROM devices WHERE user = ? AND deviceid = ?",
                  user.id,
                  action.device as string
                );
                if (device) {
                  deviceId = device.id;
                }
              }

              const {
                podcast,
                episode,
                action: actionName,
                timestamp: actionTimestamp,
                position,
                started,
                total,
                device,
                guid,
                ...extra
              } = action;

              const dataJson = JSON.stringify({ guid, ...extra });

              let changed = timestamp;
              if (actionTimestamp) {
                const parsed = new Date(actionTimestamp);
                if (!isNaN(parsed.getTime())) {
                  changed = Math.floor(parsed.getTime() / 1000);
                }
              }

              ctx.db.run(
                `INSERT INTO episodes_actions 
                 (user, subscription, episode, device, url, changed, action, position, started, total, data)
                 VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
                user.id,
                subscription?.id ?? null,
                deviceId,
                episodeUrl,
                changed,
                actionType,
                position ?? null,
                started ?? null,
                total ?? null,
                dataJson
              );
            }
          });

          return json({ timestamp });
        }

        return error("Method not allowed", 405);
      } catch (e) {
        if (e instanceof Response) return e;
        if (e instanceof ZodError) {
          return zodError(e);
        }
        ctx.logger.error({ err: e }, "NextCloud episodes handler error");
        return error("Server error", 500);
      }
    },

    notImplemented: async (_req: Request): Promise<Response> => {
      return error("Not implemented", 501);
    },
  };
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
