import { ok } from "../lib/response";
import { createRouteHandlerMap } from "../lib/routing";

export default createRouteHandlerMap((ctx) => ({
  "/api/b-ext/config": async () => {
    return ok({
      title: ctx.config.title,
      enableRegistration: ctx.config.enableRegistration,
    });
  },
}));
