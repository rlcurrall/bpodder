import z4 from "zod/v4";

import { requireAuth } from "../lib/auth";
import { parseParam } from "../lib/params";
import { badRequest, options, methodNotAllowed, notFound, ok, serverError } from "../lib/response";
import { EpisodePostBody } from "../lib/schemas";

export function createEpisodeHandlers(ctx: AppContext): {
  episodes: RouteDefinition<"/api/2/episodes/:username">;
} {
  return {
    episodes: {
      OPTIONS: options(["GET", "POST", "OPTIONS"]),
      PUT: methodNotAllowed(),
      DELETE: methodNotAllowed(),
      async GET(req) {
        const rawUsername = req.params.username;
        const { value: username } = parseParam(rawUsername);

        if (!username) {
          return notFound("Invalid route");
        }

        try {
          const user = await requireAuth(req, ctx.db, ctx.sessions, username);

          const url = new URL(req.url);
          let since = parseInt(url.searchParams.get("since") ?? "0", 10);
          if (isNaN(since)) since = 0;

          const podcastFilter = url.searchParams.get("podcast");
          const deviceFilter = url.searchParams.get("device");
          const aggregated = url.searchParams.get("aggregated") === "true";

          let sql: string;
          const params: (string | number)[] = [user.id, since];

          if (aggregated) {
            let filters = "";
            if (podcastFilter) {
              filters += " AND s.url = ?";
              params.push(podcastFilter);
            }
            if (deviceFilter) {
              filters += " AND d.deviceid = ?";
              params.push(deviceFilter);
            }

            sql = `
              SELECT * FROM (
                SELECT
                  ea.id,
                  ea.url as episode,
                  ea.action,
                  ea.changed as timestamp,
                  ea.position,
                  ea.started,
                  ea.total,
                  ea.data,
                  s.url as podcast,
                  d.deviceid as device,
                  ROW_NUMBER() OVER (PARTITION BY ea.url ORDER BY ea.changed DESC, ea.id DESC) as rn
                FROM episodes_actions ea
                LEFT JOIN subscriptions s ON ea.subscription = s.id
                LEFT JOIN devices d ON ea.device = d.id
                WHERE ea.user = ? AND ea.uploaded_at >= ?
                ${filters}
              ) WHERE rn = 1
              ORDER BY timestamp
            `;
          } else {
            sql = `
              SELECT
                ea.id,
                ea.url as episode,
                ea.action,
                ea.changed as timestamp,
                ea.position,
                ea.started,
                ea.total,
                ea.data,
                s.url as podcast,
                d.deviceid as device
              FROM episodes_actions ea
              LEFT JOIN subscriptions s ON ea.subscription = s.id
              LEFT JOIN devices d ON ea.device = d.id
              WHERE ea.user = ? AND ea.uploaded_at >= ?
            `;

            if (podcastFilter) {
              sql += " AND s.url = ?";
              params.push(podcastFilter);
            }
            if (deviceFilter) {
              sql += " AND d.deviceid = ?";
              params.push(deviceFilter);
            }

            sql += " ORDER BY ea.changed";
          }

          const rows = ctx.db.all<{
            episode: string;
            action: string;
            timestamp: number;
            position: number | null;
            started: number | null;
            total: number | null;
            data: string | null;
            podcast: string | null;
            device: string | null;
          }>(sql, ...params);

          const actions = rows.map((row) => {
            const action: Record<string, unknown> = {
              podcast: row.podcast ?? "",
              episode: row.episode,
              action: row.action,
              timestamp: formatTimestamp(row.timestamp),
            };

            if (row.position !== null) action.position = row.position;
            if (row.started !== null) action.started = row.started;
            if (row.total !== null) action.total = row.total;
            if (row.device) action.device = row.device;

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

          return ok({
            timestamp,
            actions,
            update_urls: [],
          });
        } catch (e) {
          if (e instanceof Response) return e;
          if (e instanceof z4.ZodError) {
            return badRequest(e);
          }
          ctx.logger.error({ err: e }, "Episodes handler error");
          return serverError("Server error");
        }
      },
      async POST(req) {
        const rawUsername = req.params.username;
        const { value: username } = parseParam(rawUsername);

        if (!username) {
          return notFound("Invalid route");
        }

        try {
          const user = await requireAuth(req, ctx.db, ctx.sessions, username);

          const rawBody = await req.json();
          const parseResult = EpisodePostBody.safeParse(rawBody);

          if (!parseResult.success) {
            return badRequest(parseResult.error);
          }

          const actions = Array.isArray(parseResult.data)
            ? parseResult.data
            : parseResult.data.actions;

          const timestamp = Math.floor(Date.now() / 1000);

          if (actions.length === 0) {
            return ok({
              timestamp,
              update_urls: [],
            });
          }

          const updateUrls: string[][] = [];

          ctx.db.transaction(() => {
            for (const action of actions) {
              // Sanitize URLs - trim whitespace and track rewrites
              const sanitizedPodcast = action.podcast.trim();
              const sanitizedEpisode = action.episode.trim();

              if (sanitizedPodcast !== action.podcast) {
                updateUrls.push([action.podcast, sanitizedPodcast]);
              }
              if (sanitizedEpisode !== action.episode) {
                updateUrls.push([action.episode, sanitizedEpisode]);
              }

              // Look up subscription across all devices (for reuse)
              let subscription = ctx.db.first<{ id: number; device: number }>(
                "SELECT id, device FROM subscriptions WHERE user = ? AND url = ? AND deleted = 0",
                user.id,
                sanitizedPodcast,
              );

              let subscriptionDeviceId: number | null = null;

              if (action.device) {
                // If action specifies a device, use that device for the subscription
                const device = ctx.db.first<{ id: number }>(
                  "SELECT id FROM devices WHERE user = ? AND deviceid = ?",
                  user.id,
                  action.device,
                );
                if (device) {
                  subscriptionDeviceId = device.id;
                }
              }

              if (!subscription) {
                // Create new subscription - use specified device or find/create default device
                let devicePk = subscriptionDeviceId;

                if (!devicePk) {
                  // No device specified - find or create a default device
                  let defaultDevice = ctx.db.first<{ id: number }>(
                    "SELECT id FROM devices WHERE user = ? ORDER BY id LIMIT 1",
                    user.id,
                  );

                  if (!defaultDevice) {
                    // Create a default device
                    ctx.db.run(
                      "INSERT INTO devices (user, deviceid, caption, type, data) VALUES (?, ?, ?, ?, NULL)",
                      user.id,
                      "_default",
                      "Default Device",
                      "other",
                    );
                    defaultDevice = ctx.db.first<{ id: number }>(
                      "SELECT id FROM devices WHERE user = ? AND deviceid = ?",
                      user.id,
                      "_default",
                    );
                  }

                  devicePk = defaultDevice!.id;
                }

                ctx.db.run(
                  "INSERT INTO subscriptions (user, device, feed, url, deleted, changed, data) VALUES (?, ?, NULL, ?, 0, ?, NULL)",
                  user.id,
                  devicePk,
                  sanitizedPodcast,
                  timestamp,
                );
                subscription = ctx.db.first<{ id: number; device: number }>(
                  "SELECT id, device FROM subscriptions WHERE user = ? AND device = ? AND url = ? AND deleted = 0",
                  user.id,
                  devicePk,
                  sanitizedPodcast,
                );
              }

              // Use the subscription's device for the episode action (unless action specifies different device)
              let actionDeviceId: number | null = subscriptionDeviceId;
              if (!actionDeviceId && subscription) {
                actionDeviceId = subscription.device;
              }

              const {
                action: actionType,
                timestamp: actionTimestamp,
                position,
                started,
                total,
                guid,
                ...extra
              } = action;

              const dataJson = JSON.stringify({ guid, ...extra });

              const changedTs = actionTimestamp ? parseTimestamp(actionTimestamp) : timestamp;

              ctx.db.run(
                `INSERT INTO episodes_actions
                  (user, subscription, episode, device, url, changed, uploaded_at, action, position, started, total, data)
                  VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                user.id,
                subscription?.id ?? null,
                actionDeviceId,
                sanitizedEpisode,
                changedTs,
                timestamp,
                actionType,
                position ?? null,
                started ?? null,
                total ?? null,
                dataJson,
              );
            }
          });

          return ok({
            timestamp,
            update_urls: updateUrls,
          });
        } catch (e) {
          if (e instanceof Response) return e;
          if (e instanceof z4.ZodError) {
            return badRequest(e);
          }
          ctx.logger.error({ err: e }, "Episodes handler error");
          return serverError("Server error");
        }
      },
    },
  };
}

function parseTimestamp(ts?: string | number): number {
  if (ts === undefined || ts === null) {
    return Math.floor(Date.now() / 1000);
  }
  // If it's already a number, treat it as Unix timestamp (seconds)
  if (typeof ts === "number") {
    return Math.floor(ts);
  }
  // If it's a string that looks like a number (Unix timestamp), parse it directly
  if (/^\d+$/.test(ts)) {
    return Math.floor(parseInt(ts, 10));
  }
  // Otherwise, try to parse as ISO 8601 date string
  const parsed = new Date(ts);
  if (isNaN(parsed.getTime())) {
    return Math.floor(Date.now() / 1000);
  }
  return Math.floor(parsed.getTime() / 1000);
}

function formatTimestamp(unix: number): string {
  return new Date(unix * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}
