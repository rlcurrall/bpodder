import { config } from "@server/config";
import { serve } from "bun";

import { createDB } from "./server/db";
import createAuthHandlers from "./server/handlers/auth";
import createConfigHandlers from "./server/handlers/config";
import createDeviceHandlers from "./server/handlers/devices";
import createEpisodeHandlers from "./server/handlers/episodes";
import createHealthHandlers from "./server/handlers/health";
import createSettingsHandlers from "./server/handlers/settings";
import createSubscriptionHandlers from "./server/handlers/subscriptions";
import createSyncHandlers from "./server/handlers/sync";
import { SessionStore } from "./server/lib/auth";
import { toErrorResponse } from "./server/lib/errors";
import { createLogger } from "./server/lib/logger";
import { createDefaultHandler } from "./server/lib/routing";
import { createErrorHandlingMiddleware } from "./server/middleware/error-middleware";
import { createLoggingMiddleware } from "./server/middleware/logging-middleware";
import homepage from "./web/index.html";

export function createApp(cfg: Config = config): ReturnType<typeof serve> {
  const db = createDB(cfg.dbFile);
  const sessions = new SessionStore(`${cfg.dataRoot}/sessions.sqlite`);
  const logger = createLogger(cfg);

  const ctx: AppContext = {
    db,
    config: cfg,
    sessions,
    logger,
  };

  const auth = createAuthHandlers(ctx);
  const config = createConfigHandlers(ctx);
  const devices = createDeviceHandlers(ctx);
  const health = createHealthHandlers(ctx);
  const subscriptions = createSubscriptionHandlers(ctx);
  const episodes = createEpisodeHandlers(ctx);
  const settings = createSettingsHandlers(ctx);
  const sync = createSyncHandlers(ctx);
  const errorHandlingMiddleware = createErrorHandlingMiddleware(ctx);
  const loggingMiddleware = createLoggingMiddleware(ctx);

  // Compose middleware: logging wraps error handling
  // Order matters: request enters logging first, error handling translates errors to Response,
  // then logging logs the final status code
  const wrap = <T extends string>(route: RouteDefinition<T>) =>
    loggingMiddleware(errorHandlingMiddleware(route));

  const server = serve({
    port: cfg.port,
    development: process.env.NODE_ENV !== "production",
    routes: {
      // GPodder API v2
      "/api/2/auth/:username/:action": wrap(auth["/api/2/auth/:username/:action"]),
      "/api/2/devices/:username": wrap(devices["/api/2/devices/:username"]),
      "/api/2/devices/:username/:deviceid": wrap(devices["/api/2/devices/:username/:deviceid"]),
      "/api/2/subscriptions/:username/:deviceid": wrap(
        subscriptions["/api/2/subscriptions/:username/:deviceid"],
      ),
      "/api/2/episodes/:username": wrap(episodes["/api/2/episodes/:username"]),
      "/api/2/settings/:username/:scope": wrap(settings["/api/2/settings/:username/:scope"]),
      "/api/2/sync-devices/:username": wrap(sync["/api/2/sync-devices/:username"]),

      // V2.11 all-devices subscription list (no deviceid)
      "/api/2/subscriptions/:username": wrap(subscriptions["/api/2/subscriptions/:username"]),

      // Simple API - single handler
      "/subscriptions/:username": wrap(subscriptions["/subscriptions/:username"]),
      "/subscriptions/:username/:deviceid": wrap(
        subscriptions["/subscriptions/:username/:deviceid"],
      ),

      // Health
      "/health": wrap(health["/health"]),

      // bpodder extension APIs
      "/api/b-ext/config": wrap(config["/api/b-ext/config"]),
      "/api/b-ext/login": wrap(auth["/api/b-ext/login"]),
      "/api/b-ext/register": wrap(auth["/api/b-ext/register"]),
      "/api/b-ext/subscriptions/:username": wrap(
        subscriptions["/api/b-ext/subscriptions/:username"],
      ),
      "/api/b-ext/subscriptions/:username/:deviceid": wrap(
        subscriptions["/api/b-ext/subscriptions/:username/:deviceid"],
      ),
      "/api/b-ext/episodes/:username": wrap(episodes["/api/b-ext/episodes/:username"]),
      "/api/b-ext/summary/:username": wrap(episodes["/api/b-ext/summary/:username"]),

      // Web app routes - all serve the same homepage, client-side routing will handle the rest
      "/": homepage,
      "/login": homepage,
      "/register": homepage,
      "/dashboard": homepage,
      "/subscriptions": homepage,
      "/devices": homepage,
      "/activity": homepage,
      "/settings": homepage,
    },

    fetch: createDefaultHandler(ctx),
    error: (err) => {
      logger.error({ err }, "Unhandled error outside route middleware");
      return toErrorResponse(err, logger);
    },
  });

  // Graceful shutdown
  const shutdown = () => {
    logger.info("Shutting down gracefully...");
    sessions.close();
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
  logger.info(`Starting bpodder on http://localhost:${config.port}`);
  createApp(config);
}
