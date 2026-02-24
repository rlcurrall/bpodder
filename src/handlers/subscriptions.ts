import { requireAuth } from "../lib/auth";
import { parseParam } from "../lib/params";
import { json, empty, text, opml, error } from "../lib/response";
import { SubscriptionChangeBody, SubscriptionPutBody, isHttpUrl, zodError } from "../lib/schemas";
import { ZodError } from "zod";

function sanitizeUrl(url: string): { url: string; modified: boolean } {
  const trimmed = url.trim();
  return { url: trimmed, modified: trimmed !== url };
}

const opmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
  <head>
    <title>Subscriptions</title>
  </head>
  <body>
`;

export function createSubscriptionHandlers(ctx: AppContext): {
  subscriptionsV2: RouteDefinition<"/api/2/subscriptions/:username/:deviceid">;
  subscriptionsAll: RouteDefinition<"/api/2/subscriptions/:username">;
  subscriptionsUserLevel: RouteDefinition<"/subscriptions/:username">;
  subscriptionsDeviceLevel: RouteDefinition<"/subscriptions/:username/:deviceid">;
  opml: RouteDefinition<"/opml/:username/:deviceid">;
} {
  // Shared logic for adding subscriptions
  function addSubscriptions(userId: number, urls: string[], timestamp: number): void {
    for (const url of urls) {
      if (!isHttpUrl(url)) continue;

      const existing = ctx.db.first<{ id: number; deleted: number }>(
        "SELECT id, deleted FROM subscriptions WHERE user = ? AND url = ?",
        userId,
        url,
      );

      if (existing) {
        if (existing.deleted) {
          ctx.db.run(
            "UPDATE subscriptions SET deleted = 0, changed = ? WHERE id = ?",
            timestamp,
            existing.id,
          );
        } else {
          // Update timestamp so since=T returns it
          ctx.db.run("UPDATE subscriptions SET changed = ? WHERE id = ?", timestamp, existing.id);
        }
      } else {
        ctx.db.run(
          "INSERT INTO subscriptions (user, feed, url, deleted, changed, data) VALUES (?, NULL, ?, 0, ?, NULL)",
          userId,
          url,
          timestamp,
        );
      }
    }
  }

  function ensureDevice(userId: number, deviceId: string): void {
    ctx.db.upsert(
      "devices",
      {
        user: userId,
        deviceid: deviceId,
        caption: null,
        type: null,
        data: null,
      },
      ["user", "deviceid"],
    );
  }

  // Build OPML response for user
  function buildOPML(userId: number): string {
    const subs = ctx.db.all<{ url: string; data: string | null }>(
      "SELECT url, data FROM subscriptions WHERE user = ? AND deleted = 0",
      userId,
    );

    let opmlContent = opmlHeader;

    for (const sub of subs) {
      let title = sub.url;
      try {
        if (sub.data) {
          const data = JSON.parse(sub.data);
          if (data.title) title = data.title;
        }
      } catch {
        // ignore
      }

      const escapedUrl = sub.url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
      const escapedTitle = title.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

      opmlContent += `    <outline type="rss" xmlUrl="${escapedUrl}" title="${escapedTitle}" text="${escapedTitle}" />\n`;
    }

    opmlContent += `  </body>\n</opml>\n`;
    return opmlContent;
  }

  return {
    // V2 delta sync: GET|POST /api/2/subscriptions/:username/:deviceid
    subscriptionsV2: {
      async GET(req) {
        const username = req.params.username;
        const { value: deviceid } = parseParam(req.params.deviceid);

        try {
          const user = await requireAuth(req, ctx.db, ctx.sessions, username);

          // Auto-create device if it doesn't exist (per GPodder API spec)
          ensureDevice(user.id, deviceid);

          const url = new URL(req.url);
          const since = parseInt(url.searchParams.get("since") ?? "0", 10) || 0;

          const subs = ctx.db.all<{
            url: string;
            deleted: number;
            changed: number;
          }>(
            "SELECT url, deleted, changed FROM subscriptions WHERE user = ? AND changed >= ?",
            user.id,
            since,
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
          return json({ add, remove, timestamp, update_urls: [] });

          return error("Method not allowed", 405);
        } catch (e) {
          if (e instanceof Response) return e;
          if (e instanceof ZodError) {
            return zodError(e);
          }
          ctx.logger.error({ err: e }, "V2 subscriptions handler error");
          return error("Server error", 500);
        }
      },

      async POST(req) {
        const username = req.params.username;
        const { value: deviceid } = parseParam(req.params.deviceid);

        try {
          const user = await requireAuth(req, ctx.db, ctx.sessions, username);

          // Auto-create device if it doesn't exist (per GPodder API spec)
          ensureDevice(user.id, deviceid);

          const rawBody = await req.json();
          const parseResult = SubscriptionChangeBody.safeParse(rawBody);

          if (!parseResult.success) {
            return zodError(parseResult.error);
          }

          const { add: addList, remove: removeList } = parseResult.data;

          // Check for same URL in both lists
          for (const u of addList) {
            if (removeList.includes(u)) {
              return error("URL in both add and remove", 400);
            }
          }

          const updateUrls: string[][] = [];
          const timestamp = Math.floor(Date.now() / 1000);

          ctx.db.transaction(() => {
            for (const u of addList) {
              const sanitized = sanitizeUrl(u);
              if (sanitized.modified) {
                // GPodder API: array of [old, new] tuples
                updateUrls.push([u, sanitized.url]);
              }

              if (!isHttpUrl(sanitized.url)) {
                // Per GPodder spec: rewrite non-HTTP URLs to empty string and skip
                updateUrls.push([sanitized.url, ""]);
                continue;
              }

              const existing = ctx.db.first<{ id: number; deleted: number }>(
                "SELECT id, deleted FROM subscriptions WHERE user = ? AND url = ?",
                user.id,
                sanitized.url,
              );

              if (existing) {
                if (existing.deleted) {
                  ctx.db.run(
                    "UPDATE subscriptions SET deleted = 0, changed = ? WHERE id = ?",
                    timestamp,
                    existing.id,
                  );
                } else {
                  ctx.db.run(
                    "UPDATE subscriptions SET changed = ? WHERE id = ?",
                    timestamp,
                    existing.id,
                  );
                }
              } else {
                ctx.db.run(
                  "INSERT INTO subscriptions (user, feed, url, deleted, changed, data) VALUES (?, NULL, ?, 0, ?, NULL)",
                  user.id,
                  sanitized.url,
                  timestamp,
                );
              }
            }

            for (const u of removeList) {
              const sanitized = sanitizeUrl(u);
              if (sanitized.modified) {
                updateUrls.push([u, sanitized.url]);
              }

              if (!isHttpUrl(sanitized.url)) {
                // Per GPodder spec: rewrite non-HTTP URLs to empty string and skip
                updateUrls.push([sanitized.url, ""]);
                continue;
              }

              ctx.db.run(
                "UPDATE subscriptions SET deleted = 1, changed = ? WHERE user = ? AND url = ?",
                timestamp,
                user.id,
                sanitized.url,
              );
            }
          });

          return json({ timestamp, update_urls: updateUrls });
        } catch (e) {
          if (e instanceof Response) return e;
          if (e instanceof ZodError) {
            return zodError(e);
          }
          ctx.logger.error({ err: e }, "V2 subscriptions handler error");
          return error("Server error", 500);
        }
      },
    },

    // V2.11 all subscriptions: GET /api/2/subscriptions/:username
    subscriptionsAll: {
      async GET(req) {
        try {
          const { value: username } = parseParam(req.params.username);
          const user = await requireAuth(req, ctx.db, ctx.sessions, username);

          const subs = ctx.db.all<{ url: string }>(
            "SELECT url FROM subscriptions WHERE user = ? AND deleted = 0",
            user.id,
          );

          return json(subs.map((s) => s.url));
        } catch (e) {
          if (e instanceof Response) return e;
          ctx.logger.error({ err: e }, "All subscriptions handler error");
          return error("Server error", 500);
        }
      },
    },

    // Simple API user-level: GET /subscriptions/:username (returns .json or .opml)
    subscriptionsUserLevel: {
      async GET(req) {
        try {
          const { value: username, ext } = parseParam(req.params.username);
          const user = await requireAuth(req, ctx.db, ctx.sessions, username);

          if (ext === "opml") {
            return opml(buildOPML(user.id));
          }

          // Default to JSON array
          const subs = ctx.db.all<{ url: string }>(
            "SELECT url FROM subscriptions WHERE user = ? AND deleted = 0",
            user.id,
          );

          return json(subs.map((s) => s.url));
        } catch (e) {
          if (e instanceof Response) return e;
          ctx.logger.error({ err: e }, "User-level subscriptions handler error");
          return error("Server error", 500);
        }
      },
    },

    // Simple API device-level: GET|PUT /subscriptions/:username/:deviceid
    subscriptionsDeviceLevel: {
      async GET(req) {
        const rawUsername = req.params.username;
        const rawDeviceid = req.params.deviceid;
        const { value: username } = parseParam(rawUsername);
        const { value: deviceid, ext } = parseParam(rawDeviceid);

        try {
          const user = await requireAuth(req, ctx.db, ctx.sessions, username);

          // Verify device exists
          const device = ctx.db.first<{ id: number }>(
            "SELECT id FROM devices WHERE user = ? AND deviceid = ?",
            user.id,
            deviceid,
          );
          if (!device) {
            return error("Device not found", 404);
          }

          if (ext === "txt") {
            const subs = ctx.db.all<{ url: string }>(
              "SELECT url FROM subscriptions WHERE user = ? AND deleted = 0",
              user.id,
            );
            return text(subs.map((s) => s.url).join("\n"));
          }

          if (ext === "opml") {
            return opml(buildOPML(user.id));
          }

          // Default JSON
          const subs = ctx.db.all<{ url: string }>(
            "SELECT url FROM subscriptions WHERE user = ? AND deleted = 0",
            user.id,
          );
          return json(subs.map((s) => s.url));
        } catch (e) {
          if (e instanceof Response) return e;
          ctx.logger.error({ err: e }, "Device-level GET handler error");
          return error("Server error", 500);
        }
      },

      async PUT(req) {
        const rawUsername = req.params.username;
        const rawDeviceid = req.params.deviceid;
        const { value: username } = parseParam(rawUsername);
        const { value: deviceid, ext } = parseParam(rawDeviceid);

        try {
          const user = await requireAuth(req, ctx.db, ctx.sessions, username);

          ensureDevice(user.id, deviceid);

          let urls: string[] = [];

          if (ext === "txt") {
            const body = await req.text();
            urls = body
              .split("\n")
              .map((u) => u.trim())
              .filter((u) => u && isHttpUrl(u));
          } else {
            // JSON (default)
            const rawBody = await req.json();
            const parseResult = SubscriptionPutBody.safeParse(rawBody);

            if (!parseResult.success) {
              return zodError(parseResult.error);
            }

            for (const item of parseResult.data) {
              if (typeof item === "string") {
                urls.push(item);
              } else {
                urls.push(item.feed);
              }
            }
          }

          const timestamp = Math.floor(Date.now() / 1000);
          addSubscriptions(user.id, urls, timestamp);

          return empty(200);
        } catch (e) {
          if (e instanceof Response) return e;
          if (e instanceof ZodError) {
            return zodError(e);
          }
          ctx.logger.error({ err: e }, "Device-level PUT handler error");
          return error("Server error", 500);
        }
      },
    },

    // Legacy OPML export handler (routes still point here)
    opml: {
      async GET(req) {
        try {
          const rawUsername = req.params.username;
          const rawDeviceid = req.params.deviceid;
          const { value: username } = parseParam(rawUsername);
          const { value: deviceid } = rawDeviceid ? parseParam(rawDeviceid) : { value: "" };

          const user = await requireAuth(req, ctx.db, ctx.sessions, username);

          if (deviceid) {
            const device = ctx.db.first<{ id: number }>(
              "SELECT id FROM devices WHERE user = ? AND deviceid = ?",
              user.id,
              deviceid,
            );
            if (!device) {
              return error("Device not found", 404);
            }
          }

          return opml(buildOPML(user.id));
        } catch (e) {
          if (e instanceof Response) return e;
          ctx.logger.error({ err: e }, "OPML handler error");
          return error("Server error", 500);
        }
      },
    },
  };
}
