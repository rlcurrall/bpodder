import {
  SubscriptionSyncRequest,
  SubscriptionReplaceRequest,
  SubscriptionDeltaResponse,
  SubscriptionUploadResponse,
  SubscriptionListResponse,
  isHttpUrl,
} from "@shared/schemas/index";
import { z } from "zod/v4";

import { requireAuth } from "../lib/auth";
import { parseOPML } from "../lib/opml";
import { parseParam } from "../lib/params";
import {
  opml,
  options,
  methodNotAllowed,
  ok,
  serverError,
  empty,
  badRequest,
  notFound,
} from "../lib/response";
import { createRouteHandlerMap } from "../lib/routing";

export default createRouteHandlerMap((ctx) => ({
  // V2 delta sync: GET|POST /api/2/subscriptions/:username/:deviceid
  "/api/2/subscriptions/:username/:deviceid": {
    OPTIONS: options(["GET", "POST", "OPTIONS"]),
    PUT: methodNotAllowed(),
    DELETE: methodNotAllowed(),

    async GET(req) {
      const username = req.params.username;
      const { value: deviceid } = parseParam(req.params.deviceid);

      try {
        const user = await requireAuth(req, ctx.db, ctx.sessions, username);

        // Auto-create device if it doesn't exist (per GPodder API spec)
        const devicePk = ensureDevice(ctx, { userId: user.id, deviceId: deviceid });

        const url = new URL(req.url);
        const since = parseInt(url.searchParams.get("since") ?? "0", 10) || 0;

        const subs = ctx.db.all<{
          url: string;
          deleted: number;
          changed: number;
        }>(
          "SELECT url, deleted, changed FROM subscriptions WHERE user = ? AND device = ? AND changed >= ?",
          user.id,
          devicePk,
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
        const response = SubscriptionDeltaResponse.parse({
          add,
          remove,
          timestamp,
          update_urls: [],
        });
        return ok(response);
      } catch (e) {
        if (e instanceof Response) return e;
        if (e instanceof z.ZodError) {
          return badRequest(e);
        }
        ctx.logger.error({ err: e }, "V2 subscriptions handler error");
        return serverError("Server error");
      }
    },

    async POST(req) {
      const username = req.params.username;
      const { value: deviceid } = parseParam(req.params.deviceid);

      try {
        const user = await requireAuth(req, ctx.db, ctx.sessions, username);

        // Auto-create device if it doesn't exist (per GPodder API spec)
        const devicePk = ensureDevice(ctx, { userId: user.id, deviceId: deviceid });

        const rawBody = await req.json();
        const parseResult = SubscriptionSyncRequest.safeParse(rawBody);

        if (!parseResult.success) {
          return badRequest(parseResult.error);
        }

        const { add: addList, remove: removeList } = parseResult.data;

        // Check for same URL in both lists
        for (const u of addList) {
          if (removeList.includes(u)) {
            return badRequest("URL in both add and remove");
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
              "SELECT id, deleted FROM subscriptions WHERE user = ? AND device = ? AND url = ?",
              user.id,
              devicePk,
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
                "INSERT INTO subscriptions (user, device, feed, url, deleted, changed, data) VALUES (?, ?, NULL, ?, 0, ?, NULL)",
                user.id,
                devicePk,
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
              "UPDATE subscriptions SET deleted = 1, changed = ? WHERE user = ? AND device = ? AND url = ?",
              timestamp,
              user.id,
              devicePk,
              sanitized.url,
            );
          }
        });

        const response = SubscriptionUploadResponse.parse({ timestamp, update_urls: updateUrls });
        return ok(response);
      } catch (e) {
        if (e instanceof Response) return e;
        if (e instanceof z.ZodError) {
          return badRequest(e);
        }
        ctx.logger.error({ err: e }, "V2 subscriptions handler error");
        return serverError("Server error");
      }
    },
  },

  // V2.11 all subscriptions: GET /api/2/subscriptions/:username
  "/api/2/subscriptions/:username": {
    OPTIONS: options(["GET", "OPTIONS"]),
    PUT: methodNotAllowed(),
    POST: methodNotAllowed(),
    DELETE: methodNotAllowed(),

    async GET(req) {
      try {
        const { value: username } = parseParam(req.params.username);
        const user = await requireAuth(req, ctx.db, ctx.sessions, username);

        const subs = ctx.db.all<{ url: string }>(
          "SELECT DISTINCT url FROM subscriptions WHERE user = ? AND deleted = 0",
          user.id,
        );

        const response = SubscriptionListResponse.parse(subs.map((s) => s.url));
        return ok(response);
      } catch (e) {
        if (e instanceof Response) return e;
        ctx.logger.error({ err: e }, "All subscriptions handler error");
        return serverError("Server error");
      }
    },
  },

  // Simple API user-level: GET /subscriptions/:username (returns .json or .opml)
  "/subscriptions/:username": {
    OPTIONS: options(["GET", "OPTIONS"]),
    PUT: methodNotAllowed(),
    POST: methodNotAllowed(),
    DELETE: methodNotAllowed(),

    async GET(req) {
      try {
        const { value: username, ext } = parseParam(req.params.username);
        const user = await requireAuth(req, ctx.db, ctx.sessions, username);

        if (ext === "opml") {
          return opml(buildOPML(ctx, { userId: user.id }));
        }

        const subs = ctx.db.all<{ url: string }>(
          "SELECT DISTINCT url FROM subscriptions WHERE user = ? AND deleted = 0",
          user.id,
        );

        const response = SubscriptionListResponse.parse(subs.map((s) => s.url));
        return ok(response);
      } catch (e) {
        if (e instanceof Response) return e;
        ctx.logger.error({ err: e }, "User-level subscriptions handler error");
        return serverError("Server error");
      }
    },
  },

  // Simple API device-level: GET|PUT /subscriptions/:username/:deviceid
  "/subscriptions/:username/:deviceid": {
    OPTIONS: options(["GET", "PUT", "OPTIONS"]),
    POST: methodNotAllowed(),
    DELETE: methodNotAllowed(),

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
          return notFound("Device not found");
        }

        if (ext === "txt") {
          const subs = ctx.db.all<{ url: string }>(
            "SELECT url FROM subscriptions WHERE user = ? AND device = ? AND deleted = 0",
            user.id,
            device.id,
          );
          return ok(subs.map((s) => s.url).join("\n"));
        }

        if (ext === "opml") {
          return opml(buildOPML(ctx, { userId: user.id, devicePk: device.id }));
        }

        // Default JSON
        const subs = ctx.db.all<{ url: string }>(
          "SELECT url FROM subscriptions WHERE user = ? AND device = ? AND deleted = 0",
          user.id,
          device.id,
        );
        const response = SubscriptionListResponse.parse(subs.map((s) => s.url));
        return ok(response);
      } catch (e) {
        if (e instanceof Response) return e;
        ctx.logger.error({ err: e }, "Device-level GET handler error");
        return serverError("Server error");
      }
    },

    async PUT(req) {
      const rawUsername = req.params.username;
      const rawDeviceid = req.params.deviceid;
      const { value: username } = parseParam(rawUsername);
      const { value: deviceid, ext } = parseParam(rawDeviceid);

      try {
        const user = await requireAuth(req, ctx.db, ctx.sessions, username);

        const devicePk = ensureDevice(ctx, { userId: user.id, deviceId: deviceid });

        let urls: string[] = [];

        if (ext === "txt") {
          const body = await req.text();
          urls = body
            .split("\n")
            .map((u) => u.trim())
            .filter((u) => u && isHttpUrl(u));
        } else if (ext === "opml") {
          // OPML upload - parse XML and extract feed URLs
          const body = await req.text();
          urls = parseOPML(body).filter((u) => isHttpUrl(u));
        } else {
          // JSON (default)
          const rawBody = await req.json();
          const parseResult = SubscriptionReplaceRequest.safeParse(rawBody);

          if (!parseResult.success) {
            return badRequest(parseResult.error);
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
        addSubscriptions(ctx, { userId: user.id, devicePk, urls, timestamp });

        return empty(200);
      } catch (e) {
        if (e instanceof Response) return e;
        if (e instanceof z.ZodError) {
          return badRequest(e);
        }
        ctx.logger.error({ err: e }, "Device-level PUT handler error");
        return serverError("Server error");
      }
    },
  },

  // Legacy OPML export handler (routes still point here)
  "/opml/:username/:deviceid": {
    OPTIONS: options(["GET", "OPTIONS"]),
    PUT: methodNotAllowed(),
    POST: methodNotAllowed(),
    DELETE: methodNotAllowed(),

    async GET(req) {
      try {
        const rawUsername = req.params.username;
        const rawDeviceid = req.params.deviceid;
        const { value: username } = parseParam(rawUsername);
        const { value: deviceid } = rawDeviceid ? parseParam(rawDeviceid) : { value: "" };

        const user = await requireAuth(req, ctx.db, ctx.sessions, username);

        let devicePk: number | undefined;
        if (deviceid) {
          const device = ctx.db.first<{ id: number }>(
            "SELECT id FROM devices WHERE user = ? AND deviceid = ?",
            user.id,
            deviceid,
          );
          if (!device) {
            return notFound("Device not found");
          }
          devicePk = device.id;
        }

        return opml(buildOPML(ctx, { userId: user.id, devicePk }));
      } catch (e) {
        if (e instanceof Response) return e;
        ctx.logger.error({ err: e }, "OPML handler error");
        return serverError("Server error");
      }
    },
  },
}));

const opmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
  <head>
    <title>Subscriptions</title>
  </head>
  <body>
`;

function sanitizeUrl(url: string): { url: string; modified: boolean } {
  const trimmed = url.trim();
  return { url: trimmed, modified: trimmed !== url };
}

// Shared logic for adding subscriptions
function addSubscriptions(
  ctx: AppContext,
  {
    userId,
    devicePk,
    urls,
    timestamp,
  }: {
    userId: number;
    devicePk: number;
    urls: string[];
    timestamp: number;
  },
): void {
  for (const url of urls) {
    if (!isHttpUrl(url)) continue;

    const existing = ctx.db.first<{ id: number; deleted: number }>(
      "SELECT id, deleted FROM subscriptions WHERE user = ? AND device = ? AND url = ?",
      userId,
      devicePk,
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
        "INSERT INTO subscriptions (user, device, feed, url, deleted, changed, data) VALUES (?, ?, NULL, ?, 0, ?, NULL)",
        userId,
        devicePk,
        url,
        timestamp,
      );
    }
  }
}

function ensureDevice(
  ctx: AppContext,
  { userId, deviceId }: { userId: number; deviceId: string },
): number {
  ctx.db.run(
    `INSERT INTO devices (user, deviceid, caption, type, data)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user, deviceid) DO NOTHING`,
    userId,
    deviceId,
    null,
    "other",
    null,
  );

  const device = ctx.db.first<{ id: number }>(
    "SELECT id FROM devices WHERE user = ? AND deviceid = ?",
    userId,
    deviceId,
  );

  return device!.id;
}

// Build OPML response for user (all devices) or specific device
function buildOPML(
  ctx: AppContext,
  { userId, devicePk }: { userId: number; devicePk?: number },
): string {
  let sql = "SELECT url, data FROM subscriptions WHERE user = ? AND deleted = 0";
  const params: (number | string)[] = [userId];

  if (devicePk) {
    sql += " AND device = ?";
    params.push(devicePk);
  }

  const subs = ctx.db.all<{ url: string; data: string | null }>(sql, ...params);

  let opmlContent = opmlHeader;

  for (const sub of subs) {
    let title = sub.url;
    try {
      if (sub.data) {
        const data = z.record(z.string(), z.any()).safeParse(JSON.parse(sub.data));
        if (data.success && data.data.title) title = data.data.title;
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
