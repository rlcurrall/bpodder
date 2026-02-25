import { serve } from "bun";

import { config } from "./config";
import { createDB } from "./db";
import { createAuthHandlers } from "./handlers/auth";
import { createDeviceHandlers } from "./handlers/devices";
import { createEpisodeHandlers } from "./handlers/episodes";
import { createSettingsHandlers } from "./handlers/settings";
import { createSubscriptionHandlers } from "./handlers/subscriptions";
import { createSyncHandlers } from "./handlers/sync";
import { SessionStore } from "./lib/auth";
import { createLogger } from "./lib/logger";
import { createDefaultHandler } from "./lib/routing";
import { createLoggingMiddleware } from "./middleware/logging-middleware";

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
    hostname: cfg.host,

    routes: {
      // GPodder API v2
      "/api/2/auth/:username/:action": loggingMiddleware(auth.auth),
      "/api/2/devices/:username": loggingMiddleware(devices.listDevices),
      "/api/2/devices/:username/:deviceid": loggingMiddleware(devices.upsertDevice),
      "/api/2/subscriptions/:username/:deviceid": loggingMiddleware(subscriptions.subscriptionsV2),
      "/api/2/episodes/:username": loggingMiddleware(episodes.episodes),
      "/api/2/settings/:username/:scope": loggingMiddleware(settings.settings),
      "/api/2/sync-devices/:username": loggingMiddleware(sync.syncDevices),

      // V2.11 all-devices subscription list (no deviceid)
      "/api/2/subscriptions/:username": loggingMiddleware(subscriptions.subscriptionsAll),

      // Simple API — single handler
      "/subscriptions/:username": loggingMiddleware(subscriptions.subscriptionsUserLevel),
      "/subscriptions/:username/:deviceid": loggingMiddleware(
        subscriptions.subscriptionsDeviceLevel,
      ),

      // Health
      "/health": loggingMiddleware(auth.health),

      // Registration
      "/register": loggingMiddleware(auth.register),
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
  logger.info(`Starting bpodder on ${config.host}:${config.port}`);
  createApp(config);
}
