import { config } from "@server/config";
import { serve } from "bun";

import { createDB } from "./server/db";
import createAuthHandlers from "./server/handlers/auth";
import createDeviceHandlers from "./server/handlers/devices";
import createEpisodeHandlers from "./server/handlers/episodes";
import createSettingsHandlers from "./server/handlers/settings";
import createSubscriptionHandlers from "./server/handlers/subscriptions";
import createSyncHandlers from "./server/handlers/sync";
import { SessionStore } from "./server/lib/auth";
import { createLogger } from "./server/lib/logger";
import { createDefaultHandler } from "./server/lib/routing";
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
  const devices = createDeviceHandlers(ctx);
  const subscriptions = createSubscriptionHandlers(ctx);
  const episodes = createEpisodeHandlers(ctx);
  const settings = createSettingsHandlers(ctx);
  const sync = createSyncHandlers(ctx);
  const defaultHandler = createDefaultHandler(ctx);
  const loggingMiddleware = createLoggingMiddleware(ctx);

  const server = serve({
    port: cfg.port,
    development: process.env.NODE_ENV !== "production",
    routes: {
      // GPodder API v2
      "/api/2/auth/:username/:action": loggingMiddleware(auth["/api/2/auth/:username/:action"]),
      "/api/2/devices/:username": loggingMiddleware(devices["/api/2/devices/:username"]),
      "/api/2/devices/:username/:deviceid": loggingMiddleware(
        devices["/api/2/devices/:username/:deviceid"],
      ),
      "/api/2/subscriptions/:username/:deviceid": loggingMiddleware(
        subscriptions["/api/2/subscriptions/:username/:deviceid"],
      ),
      "/api/2/episodes/:username": loggingMiddleware(episodes["/api/2/episodes/:username"]),
      "/api/2/settings/:username/:scope": loggingMiddleware(
        settings["/api/2/settings/:username/:scope"],
      ),
      "/api/2/sync-devices/:username": loggingMiddleware(sync["/api/2/sync-devices/:username"]),

      // V2.11 all-devices subscription list (no deviceid)
      "/api/2/subscriptions/:username": loggingMiddleware(
        subscriptions["/api/2/subscriptions/:username"],
      ),

      // Simple API - single handler
      "/subscriptions/:username": loggingMiddleware(subscriptions["/subscriptions/:username"]),
      "/subscriptions/:username/:deviceid": loggingMiddleware(
        subscriptions["/subscriptions/:username/:deviceid"],
      ),

      // Health
      "/health": loggingMiddleware(auth["/health"]),

      // UI Config
      "/api/b-ext/config": loggingMiddleware(auth["/api/b-ext/config"]),
      "/api/b-ext/login": loggingMiddleware(auth["/api/b-ext/login"]),
      "/api/b-ext/register": loggingMiddleware(auth["/api/b-ext/register"]),
      "/": homepage,
      "/login": homepage,
      "/register": homepage,
      "/dashboard": homepage,
      "/subscriptions": homepage,
      "/devices": homepage,
      "/activity": homepage,
      "/settings": homepage,
    },

    fetch: defaultHandler,
    error: (err) => {
      logger.error({ err }, "Unhandled error in request handler");
      return new Response("Internal Server Error", { status: 500 });
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
