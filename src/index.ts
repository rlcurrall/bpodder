import { serve } from "bun";
import { createDB, type DB } from "./db";
import { config, type Config } from "./config";
import { SessionStore, PollTokenStore } from "./lib/auth";
import { handleOptions, error } from "./lib/response";
import { createLogger, type Logger } from "./lib/logger";
import { createAuthHandlers } from "./handlers/auth";
import { createDeviceHandlers } from "./handlers/devices";
import { createSubscriptionHandlers } from "./handlers/subscriptions";
import { createEpisodeHandlers } from "./handlers/episodes";
import { createNextCloudHandlers } from "./handlers/nextcloud";

export interface AppContext {
  db: DB;
  config: Config;
  sessions: SessionStore;
  pollTokens: PollTokenStore;
  logger: Logger;
}

export function createApp(cfg: Config = config): ReturnType<typeof serve> {
  const db = createDB(cfg.dbFile);
  const sessions = new SessionStore(db);
  const pollTokens = new PollTokenStore(db);
  const logger = createLogger(cfg);

  const ctx: AppContext = {
    db,
    config: cfg,
    sessions,
    pollTokens,
    logger,
  };

  const auth = createAuthHandlers(ctx);
  const devices = createDeviceHandlers(ctx);
  const subscriptions = createSubscriptionHandlers(ctx);
  const episodes = createEpisodeHandlers(ctx);
  const nextcloud = createNextCloudHandlers(ctx);

  // Request logging wrapper
  function withLogging(
    handler: (req: Request) => Response | Promise<Response>,
  ): (req: Request) => Promise<Response> {
    return async (req) => {
      const start = performance.now();
      const res = await handler(req);
      const url = new URL(req.url);
      logger.info(
        {
          method: req.method,
          path: url.pathname,
          status: res.status,
          ms: Math.round(performance.now() - start),
        },
        "request",
      );
      return res;
    };
  }

  // Wrap a route handler, handling both single handlers and method objects
  function wrapRoute(
    handler:
      | ((req: Request) => Response | Promise<Response>)
      | { [method: string]: (req: Request) => Response | Promise<Response> },
  ):
    | ((req: Request) => Promise<Response>)
    | { [method: string]: (req: Request) => Promise<Response> } {
    if (typeof handler === "function") {
      return withLogging(handler);
    }
    // It's a method object like { GET: ..., PUT: ... }
    const wrapped: { [method: string]: (req: Request) => Promise<Response> } =
      {};
    for (const [method, fn] of Object.entries(handler)) {
      wrapped[method] = withLogging(fn);
    }
    return wrapped;
  }

  const rawRoutes = {
    // GPodder API v2
    "/api/2/auth/:username/:action": auth.auth,
    "/api/2/devices/:username": devices.listDevices,
    "/api/2/devices/:username/:deviceid": devices.upsertDevice,
    "/api/2/subscriptions/:username/:deviceid": subscriptions.subscriptionsV2,
    "/api/2/episodes/:username": episodes.episodes,

    // V2.11 all-devices subscription list (no deviceid)
    "/api/2/subscriptions/:username": subscriptions.subscriptionsAll,

    // Simple API — single handler, extension parsed from param
    "/subscriptions/:username": subscriptions.subscriptionsUserLevel,
    "/subscriptions/:username/:deviceid":
      subscriptions.subscriptionsDeviceLevel,

    // Health
    "/health": auth.health,

    // Registration
    "/register": auth.register,

    // NextCloud compatibility
    "/index.php/login/v2": nextcloud.ncLoginInit,
    "/index.php/login/v2/poll": nextcloud.ncLoginPoll,
    "/index.php/apps/gpoddersync/subscriptions": nextcloud.ncSubscriptions,
    "/index.php/apps/gpoddersync/subscription_change/create":
      nextcloud.ncSubscriptionChange,
    "/index.php/apps/gpoddersync/episode_action": nextcloud.ncEpisodes,

    // Unimplemented endpoints - return 501
    "/api/2/updates/:username/:deviceid": nextcloud.notImplemented,
    "/api/2/sync-devices/:username": nextcloud.notImplemented,
    "/api/2/tags/:username": nextcloud.notImplemented,
    "/api/2/favorites/:username": nextcloud.notImplemented,
    "/api/2/settings/:username/:scope": nextcloud.notImplemented,
    "/api/2/lists/:username/list.json": nextcloud.notImplemented,
    "/api/1/subscriptions/:username/:deviceid": nextcloud.notImplemented,
    "/api/1/episodes/:username": nextcloud.notImplemented,
    "/api/1/devices/:username/:deviceid": nextcloud.notImplemented,
  };

  // Wrap all routes with logging
  const routes: typeof rawRoutes = Object.fromEntries(
    Object.entries(rawRoutes).map(([path, handler]) => [
      path,
      wrapRoute(handler as any),
    ]),
  ) as any as typeof rawRoutes;

  const server = serve({
    port: cfg.port,
    hostname: cfg.host,

    routes,

    fetch(req: Request): Response | Promise<Response> {
      const url = new URL(req.url);
      const start = performance.now();

      if (req.method === "OPTIONS") {
        const res = handleOptions();
        logger.info(
          {
            method: req.method,
            path: url.pathname,
            status: res.status,
            ms: Math.round(performance.now() - start),
          },
          "request",
        );
        return res;
      }

      if (url.searchParams.has("jsonp") || url.searchParams.has("json")) {
        const res = error("JSONP is not supported", 501);
        logger.info(
          {
            method: req.method,
            path: url.pathname,
            status: res.status,
            ms: Math.round(performance.now() - start),
          },
          "request",
        );
        return res;
      }

      const contentLength = Number(req.headers.get("Content-Length") ?? 0);
      if (contentLength > cfg.maxBodySize) {
        const res = error("Request body too large", 413);
        logger.info(
          {
            method: req.method,
            path: url.pathname,
            status: res.status,
            ms: Math.round(performance.now() - start),
            bytes: contentLength,
          },
          "request",
        );
        return res;
      }

      // Log unmatched requests
      const res = error("Not found", 404);
      logger.info(
        {
          method: req.method,
          path: url.pathname,
          status: res.status,
          ms: Math.round(performance.now() - start),
        },
        "request",
      );
      return res;
    },
  });

  // Graceful shutdown
  const shutdown = () => {
    logger.info("Shutting down gracefully...");
    sessions.flush();
    try {
      db.run("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch {
      // ignore
    }
    db.close();
    logger.info("Shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  return server;
}

if (import.meta.main) {
  const logger = createLogger(config);
  logger.info(`Starting bpodder on ${config.host}:${config.port}`);
  createApp(config);
}
