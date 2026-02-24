import { json, error } from "../lib/response";
import { type PollTokenStore, type SessionStore, requireAuth } from "../lib/auth";
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
  pollTokens: PollTokenStore;
  logger: Logger;
}

export function createNextCloudHandlers(ctx: HandlerContext) {
  return {
    ncLoginInit: async (req: Request): Promise<Response> => {
      if (req.method !== "POST") {
        return error("Method not allowed", 405);
      }

      try {
        const baseUrl = ctx.config.baseUrl || `${new URL(req.url).origin}`;
        const { token, loginUrl } = await ctx.pollTokens.create(baseUrl);

        return json({
          poll: {
            token,
            endpoint: `${baseUrl}/index.php/login/v2/poll`,
          },
          login: loginUrl,
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

        const result = await ctx.pollTokens.poll(token);

        if (!result) {
          return error("Invalid token", 404);
        }

        const { loginName, appPassword } = result;

        const baseUrl = ctx.config.baseUrl || `${new URL(req.url).origin}`;

        return json({
          server: baseUrl,
          loginName,
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

        const timestamp = Math.floor(Date.now() / 1000);

        return json({ add, remove, timestamp });
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
            podcast: string | null;
            action: string;
            changed: number;
            position: number | null;
            started: number | null;
            total: number | null;
            data: string | null;
          }>(
            `SELECT 
              ea.url,
              s.url as podcast,
              ea.action,
              ea.changed,
              ea.position,
              ea.started,
              ea.total,
              ea.data
            FROM episodes_actions ea
            LEFT JOIN subscriptions s ON ea.subscription = s.id
            LEFT JOIN devices d ON ea.device = d.id
            WHERE ea.user = ? AND ea.uploaded_at >= ?
            ORDER BY ea.changed`,
            user.id,
            since
          );

          const actions = rows.map((row) => {
            const action: Record<string, unknown> = {
              podcast: row.podcast || "",
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
              const podcastUrl = (action.podcast || "").trim();
              const episodeUrl = action.episode.trim();
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

              const uploadedAt = Math.floor(Date.now() / 1000);

              ctx.db.run(
                `INSERT INTO episodes_actions
                 (user, subscription, episode, device, url, changed, uploaded_at, action, position, started, total, data)
                 VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                user.id,
                subscription?.id ?? null,
                deviceId,
                episodeUrl,
                changed,
                uploadedAt,
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
