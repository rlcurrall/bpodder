import { error, ok } from "../lib/response";
import { createRouteHandlerMap } from "../lib/routing";

export default createRouteHandlerMap((ctx) => ({
  "/health": async () => {
    try {
      ctx.db.first("SELECT 1");
      return ok({ status: "ok" });
    } catch (err) {
      ctx.logger.error({ err }, "Health check error");
      return error("Database unavailable", 503);
    }
  },
}));
