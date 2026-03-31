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
import {
  buildOpml,
  buildSubscriptionXml,
  dedupeSubscriptionsByUrl,
  validateJsonpCallback,
} from "@server/lib/subscription-format";
import { decodeSubscriptionCursor } from "@server/lib/subscription-pagination";
import * as subscriptions from "@server/services/subscriptions";
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

        const devicePk = subscriptions.ensureSubscriptionDevice(ctx.db, {
          userId: user.id,
          deviceId: deviceid,
        });

        const url = new URL(req.url);
        const since = parseInt(url.searchParams.get("since") ?? "0", 10) || 0;

        const delta = subscriptions.getSubscriptionDelta(ctx.db, {
          userId: user.id,
          devicePk,
          since,
        });

        const timestamp = Math.floor(Date.now() / 1000);
        const response = SubscriptionDeltaResponse.parse({
          ...delta,
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

        const devicePk = subscriptions.ensureSubscriptionDevice(ctx.db, {
          userId: user.id,
          deviceId: deviceid,
        });

        const rawBody = await req.json();
        const parseResult = SubscriptionSyncRequest.safeParse(rawBody);

        if (!parseResult.success) {
          return badRequest(parseResult.error);
        }

        const { add: addList, remove: removeList } = parseResult.data;

        const timestamp = Math.floor(Date.now() / 1000);
        const result = subscriptions.syncSubscriptionDelta(ctx.db, {
          userId: user.id,
          devicePk,
          add: addList,
          remove: removeList,
          timestamp,
        });

        for (const url of result.addedFetchUrls) {
          backgroundFetchFeed(ctx.db, ctx.logger, url);
        }

        const response = SubscriptionUploadResponse.parse({
          timestamp: result.timestamp,
          update_urls: result.updateUrls,
        });
        return ok(response);
      } catch (e) {
        if (e instanceof Response) return e;
        if (e instanceof subscriptions.SubscriptionSyncValidationError) {
          return badRequest(e.message);
        }
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

        const urls = subscriptions.listUserSubscriptionUrls(ctx.db, user.id);
        const response = SubscriptionListResponse.parse(urls);
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
          const urls = subscriptions.listUserSubscriptionUrls(ctx.db, user.id);
          const response = SubscriptionListResponse.parse(urls);
          return jsonp(response, callback!);
        }

        if (responseFormat === "opml") {
          const feedRows = subscriptions.listUserSubscriptionFeedRows(ctx.db, user.id);
          return opml(buildOpml(feedRows));
        }

        if (responseFormat === "xml") {
          const feedRows = subscriptions.listUserSubscriptionFeedRows(ctx.db, user.id);
          // Dedupe by URL, preferring rows with data (title/author info)
          const dedupedSubs = dedupeSubscriptionsByUrl(feedRows);
          return xml(buildSubscriptionXml(dedupedSubs));
        }

        const urls = subscriptions.listUserSubscriptionUrls(ctx.db, user.id);
        const response = SubscriptionListResponse.parse(urls);
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
        const device = subscriptions.findSubscriptionDevice(ctx.db, {
          userId: user.id,
          deviceId: deviceid,
        });
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
          const urls = subscriptions.listDeviceSubscriptionUrls(ctx.db, {
            userId: user.id,
            devicePk: device.id,
          });
          const response = SubscriptionListResponse.parse(urls);
          return jsonp(response, callback!);
        }

        if (responseFormat === "txt") {
          const urls = subscriptions.listDeviceSubscriptionUrls(ctx.db, {
            userId: user.id,
            devicePk: device.id,
          });
          return ok(urls.join("\n"));
        }

        if (responseFormat === "opml") {
          const feedRows = subscriptions.listDeviceSubscriptionFeedRows(ctx.db, {
            userId: user.id,
            devicePk: device.id,
          });
          return opml(buildOpml(feedRows));
        }

        if (responseFormat === "xml") {
          const feedRows = subscriptions.listDeviceSubscriptionFeedRows(ctx.db, {
            userId: user.id,
            devicePk: device.id,
          });
          return xml(buildSubscriptionXml(feedRows));
        }

        // Default JSON
        const urls = subscriptions.listDeviceSubscriptionUrls(ctx.db, {
          userId: user.id,
          devicePk: device.id,
        });
        const response = SubscriptionListResponse.parse(urls);
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

        const devicePk = subscriptions.ensureSubscriptionDevice(ctx.db, {
          userId: user.id,
          deviceId: deviceid,
        });

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
        const acceptedUrls = subscriptions.addDeviceSubscriptions(ctx.db, {
          userId: user.id,
          devicePk,
          urls,
          timestamp,
        });

        for (const url of acceptedUrls) {
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
            if (e instanceof subscriptions.SubscriptionCursorError) {
              return badRequest(e.message);
            }
            throw e;
          }
        }

        const result = await subscriptions.listSubscriptionsPaginated(ctx.db, {
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

        const device = subscriptions.findSubscriptionDevice(ctx.db, {
          userId: user.id,
          deviceId: deviceid,
        });
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
            if (e instanceof subscriptions.SubscriptionCursorError) {
              return badRequest(e.message);
            }
            throw e;
          }
        }

        const result = await subscriptions.listSubscriptionsPaginated(ctx.db, {
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

const simpleApiUserResponseFormats = ["json", "jsonp", "opml", "xml"] as const;
const simpleApiDeviceResponseFormats = ["json", "jsonp", "txt", "opml", "xml"] as const;
const simpleApiUploadFormats = ["json", "txt", "opml"] as const;
