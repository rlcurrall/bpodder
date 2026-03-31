import { requireAuth } from "@server/lib/auth";
import { backgroundFetchFeed } from "@server/lib/feed-fetcher";
import { resolveSimpleApiFormats } from "@server/lib/negotiation";
import { parseOPML } from "@server/lib/opml";
import { stripExtension } from "@server/lib/params";
import { getFirstSearchParam } from "@server/lib/query";
import {
  opml,
  options,
  methodNotAllowed,
  ok,
  serverError,
  empty,
  badRequest,
  notFound,
  jsonp,
  xml,
} from "@server/lib/response";
import { createRouteHandlerMap } from "@server/lib/routing";
import { decodeSubscriptionCursor } from "@server/lib/subscription-pagination";
import {
  listSubscriptionsPaginated,
  SubscriptionCursorError,
} from "@server/services/subscriptions";
import {
  SubscriptionItem,
  SubscriptionReplaceRequest,
  SubscriptionSyncRequest,
  SubscriptionDeltaResponse,
  SubscriptionUploadResponse,
  SubscriptionListResponse,
  SubscriptionListQuerySchema,
  isHttpUrl,
} from "@shared/schemas/index";
import { PaginatedResponseSchema } from "@shared/schemas/pagination";
import { XMLBuilder } from "fast-xml-parser";
import { z } from "zod/v4";

export default createRouteHandlerMap((ctx) => ({
  // V2 delta sync: GET|POST /api/2/subscriptions/:username/:deviceid
  "/api/2/subscriptions/:username/:deviceid": {
    OPTIONS: options(["GET", "POST", "OPTIONS"]),
    PUT: methodNotAllowed(),
    DELETE: methodNotAllowed(),

    async GET(req) {
      const username = req.params.username;
      const { value: deviceid } = stripExtension(req.params.deviceid, ["json"]);

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
      const { value: deviceid } = stripExtension(req.params.deviceid, ["json"]);

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

        for (const u of addList) {
          const sanitized = sanitizeUrl(u);
          if (isHttpUrl(sanitized.url)) {
            backgroundFetchFeed(ctx.db, ctx.logger, sanitized.url);
          }
        }

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
        const { value: username } = stripExtension(req.params.username, ["json"]);
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

  // Simple API user-level: GET /subscriptions/:username (returns .json, .jsonp, .opml, or .xml)
  "/subscriptions/:username": {
    OPTIONS: options(["GET", "OPTIONS"]),
    PUT: methodNotAllowed(),
    POST: methodNotAllowed(),
    DELETE: methodNotAllowed(),

    async GET(req) {
      try {
        const { value: username } = stripExtension(
          req.params.username,
          simpleApiUserResponseFormats,
        );
        const { responseFormat } = resolveSimpleApiFormats(req, {
          responseFormats: simpleApiUserResponseFormats,
        });
        const user = await requireAuth(req, ctx.db, ctx.sessions, username);

        const url = new URL(req.url);
        const jsonpCallback = url.searchParams.get("jsonp");

        if (responseFormat === "jsonp") {
          const validation = validateJsonpCallback(jsonpCallback);
          if (!validation.valid) {
            return badRequest(validation.error);
          }
          const callback = jsonpCallback;
          const subs = ctx.db.all<{ url: string }>(
            "SELECT DISTINCT url FROM subscriptions WHERE user = ? AND deleted = 0",
            user.id,
          );
          const response = SubscriptionListResponse.parse(subs.map((s) => s.url));
          return jsonp(response, callback!);
        }

        if (responseFormat === "opml") {
          return opml(buildOPML(ctx, { userId: user.id }));
        }

        if (responseFormat === "xml") {
          const subs = ctx.db.all<{ url: string; data: string | null }>(
            "SELECT url, data FROM subscriptions WHERE user = ? AND deleted = 0",
            user.id,
          );
          // Dedupe by URL, preferring rows with data (title/author info)
          const dedupedSubs = dedupeSubscriptionsByUrl(subs);
          return xml(buildSubscriptionXML(dedupedSubs));
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
      const { value: username } = stripExtension(rawUsername);
      const { value: deviceid } = stripExtension(rawDeviceid, simpleApiDeviceResponseFormats);
      const { responseFormat } = resolveSimpleApiFormats(req, {
        responseFormats: simpleApiDeviceResponseFormats,
      });

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

        const url = new URL(req.url);
        const jsonpCallback = url.searchParams.get("jsonp");

        if (responseFormat === "jsonp") {
          const validation = validateJsonpCallback(jsonpCallback);
          if (!validation.valid) {
            return badRequest(validation.error);
          }
          const callback = jsonpCallback;
          const subs = ctx.db.all<{ url: string }>(
            "SELECT url FROM subscriptions WHERE user = ? AND device = ? AND deleted = 0",
            user.id,
            device.id,
          );
          const response = SubscriptionListResponse.parse(subs.map((s) => s.url));
          return jsonp(response, callback!);
        }

        if (responseFormat === "txt") {
          const subs = ctx.db.all<{ url: string }>(
            "SELECT url FROM subscriptions WHERE user = ? AND device = ? AND deleted = 0",
            user.id,
            device.id,
          );
          return ok(subs.map((s) => s.url).join("\n"));
        }

        if (responseFormat === "opml") {
          return opml(buildOPML(ctx, { userId: user.id, devicePk: device.id }));
        }

        if (responseFormat === "xml") {
          const subs = ctx.db.all<{ url: string; data: string | null }>(
            "SELECT url, data FROM subscriptions WHERE user = ? AND device = ? AND deleted = 0",
            user.id,
            device.id,
          );
          return xml(buildSubscriptionXML(subs));
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
      const { value: username } = stripExtension(rawUsername);
      const { value: deviceid } = stripExtension(rawDeviceid, simpleApiUploadFormats);
      const { requestFormat } = resolveSimpleApiFormats(req, {
        requestFormats: simpleApiUploadFormats,
      });

      try {
        const user = await requireAuth(req, ctx.db, ctx.sessions, username);

        const devicePk = ensureDevice(ctx, { userId: user.id, deviceId: deviceid });

        let urls: string[] = [];

        if (requestFormat === "txt") {
          const body = await req.text();
          urls = body
            .split("\n")
            .map((u) => u.trim())
            .filter((u) => u && isHttpUrl(u));
        } else if (requestFormat === "opml") {
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

        for (const url of urls) {
          backgroundFetchFeed(ctx.db, ctx.logger, url);
        }

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
  // b-ext: enriched subscriptions for web UI (paginated)
  "/api/b-ext/subscriptions/:username": {
    OPTIONS: options(["GET", "OPTIONS"]),

    async GET(req) {
      try {
        const { value: username } = stripExtension(req.params.username, ["json"]);
        const user = await requireAuth(req, ctx.db, ctx.sessions, username);

        const url = new URL(req.url);
        const queryResult = SubscriptionListQuerySchema.safeParse({
          limit: url.searchParams.get("limit") ?? undefined,
          cursor: url.searchParams.get("cursor") ?? undefined,
          q: url.searchParams.get("q") ?? undefined,
          sortBy: getFirstSearchParam(url.searchParams, "sort.by", "sort[by]"),
          sortDir: getFirstSearchParam(url.searchParams, "sort.dir", "sort[dir]"),
        });

        if (!queryResult.success) {
          return badRequest(queryResult.error);
        }

        const { limit, cursor: cursorParam, q, sortBy, sortDir } = queryResult.data;

        let cursor = null;
        if (cursorParam) {
          try {
            cursor = decodeSubscriptionCursor(cursorParam, sortBy, sortDir);
          } catch (e) {
            if (e instanceof SubscriptionCursorError) {
              return badRequest(e.message);
            }
            throw e;
          }
        }

        const result = await listSubscriptionsPaginated(ctx.db, {
          userId: user.id,
          limit,
          cursor,
          q,
          sortBy,
          sortDir,
        });

        const response = PaginatedResponseSchema(SubscriptionItem).parse(result);
        return ok(response);
      } catch (e) {
        if (e instanceof Response) return e;
        ctx.logger.error({ err: e }, "b-ext subscriptions handler error");
        return serverError("Server error");
      }
    },
  },

  "/api/b-ext/subscriptions/:username/:deviceid": {
    OPTIONS: options(["GET", "OPTIONS"]),

    async GET(req) {
      try {
        const { value: username } = stripExtension(req.params.username, ["json"]);
        const { value: deviceid } = stripExtension(req.params.deviceid, ["json"]);
        const user = await requireAuth(req, ctx.db, ctx.sessions, username);

        const device = ctx.db.first<{
          id: number;
        }>("SELECT id FROM devices WHERE user = ? AND deviceid = ?", user.id, deviceid);
        if (!device) {
          return notFound("Device not found");
        }

        const url = new URL(req.url);
        const queryResult = SubscriptionListQuerySchema.safeParse({
          limit: url.searchParams.get("limit") ?? undefined,
          cursor: url.searchParams.get("cursor") ?? undefined,
          q: url.searchParams.get("q") ?? undefined,
          sortBy: getFirstSearchParam(url.searchParams, "sort.by", "sort[by]"),
          sortDir: getFirstSearchParam(url.searchParams, "sort.dir", "sort[dir]"),
        });

        if (!queryResult.success) {
          return badRequest(queryResult.error);
        }

        const { limit, cursor: cursorParam, q, sortBy, sortDir } = queryResult.data;

        let cursor = null;
        if (cursorParam) {
          try {
            cursor = decodeSubscriptionCursor(cursorParam, sortBy, sortDir);
          } catch (e) {
            if (e instanceof SubscriptionCursorError) {
              return badRequest(e.message);
            }
            throw e;
          }
        }

        const result = await listSubscriptionsPaginated(ctx.db, {
          userId: user.id,
          deviceId: device.id,
          limit,
          cursor,
          q,
          sortBy,
          sortDir,
        });

        const response = PaginatedResponseSchema(SubscriptionItem).parse(result);
        return ok(response);
      } catch (e) {
        if (e instanceof Response) return e;
        ctx.logger.error({ err: e }, "b-ext device subscriptions handler error");
        return serverError("Server error");
      }
    },
  },
}));

function sanitizeUrl(url: string): { url: string; modified: boolean } {
  const trimmed = url.trim();
  return { url: trimmed, modified: trimmed !== url };
}

// Dedupe subscriptions by URL, preferring rows with metadata
function dedupeSubscriptionsByUrl(
  subs: { url: string; data: string | null }[],
): { url: string; data: string | null }[] {
  const seen = new Map<string, { url: string; data: string | null }>();

  for (const sub of subs) {
    const existing = seen.get(sub.url);
    if (!existing) {
      seen.set(sub.url, sub);
    } else if (!existing.data && sub.data) {
      // Prefer subscription with metadata (title/author info)
      seen.set(sub.url, sub);
    }
  }

  return Array.from(seen.values());
}

// Valid characters for JSONP callback function names
const ALLOWED_JSONP_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_";
const simpleApiUserResponseFormats = ["json", "jsonp", "opml", "xml"] as const;
const simpleApiDeviceResponseFormats = ["json", "jsonp", "txt", "opml", "xml"] as const;
const simpleApiUploadFormats = ["json", "txt", "opml"] as const;

const SubscriptionMetadataSchema = z
  .object({
    title: z.string().optional(),
    website: z.string().optional(),
    author: z.string().optional(),
    description: z.string().optional(),
  })
  .loose();

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  format: true,
  suppressEmptyNode: true,
});

const opmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  format: true,
  suppressEmptyNode: false,
});

function parseSubscriptionMetadata(
  data: string | null,
): z.infer<typeof SubscriptionMetadataSchema> | null {
  if (!data) return null;

  try {
    const result = SubscriptionMetadataSchema.safeParse(JSON.parse(data));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function validateJsonpCallback(
  callback: string | null,
): { valid: true } | { valid: false; error: string } {
  if (!callback) {
    return {
      valid: false,
      error:
        "For a JSONP response, specify the name of the callback function in the jsonp parameter",
    };
  }

  for (const char of callback) {
    if (!ALLOWED_JSONP_CHARS.includes(char)) {
      return {
        valid: false,
        error: `JSONP padding can only contain the characters ${ALLOWED_JSONP_CHARS}`,
      };
    }
  }

  return { valid: true };
}

// Build XML response for subscription list
function buildSubscriptionXML(subs: Array<{ url: string; data?: string | null }>): string {
  const podcasts = subs.map((sub) => {
    const metadata = parseSubscriptionMetadata(sub.data ?? null);

    return {
      title: metadata?.title ?? sub.url,
      url: sub.url,
      ...(metadata?.website ? { website: metadata.website } : {}),
      ...(metadata?.author ? { author: metadata.author } : {}),
      ...(metadata?.description ? { description: metadata.description } : {}),
    };
  });

  return xmlBuilder.build({
    "?xml": {
      "@_version": "1.0",
      "@_encoding": "UTF-8",
    },
    podcasts: {
      podcast: podcasts,
    },
  });
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
  const body =
    subs.length === 0
      ? {}
      : {
          outline: subs.map((sub) => {
            const title = parseSubscriptionMetadata(sub.data)?.title ?? sub.url;
            return {
              "@_type": "rss",
              "@_xmlUrl": sub.url,
              "@_title": title,
              "@_text": title,
            };
          }),
        };

  return opmlBuilder.build({
    "?xml": {
      "@_version": "1.0",
      "@_encoding": "UTF-8",
    },
    opml: {
      "@_version": "1.0",
      head: {
        title: "Subscriptions",
      },
      body,
    },
  });
}
