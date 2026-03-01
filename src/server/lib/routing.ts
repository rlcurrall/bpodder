import { options, error } from "./response";

export function createRouteHandlerMap<T extends Record<string, RouteDefinition<string>>>(
  mapper: (ctx: AppContext) => T,
): (ctx: AppContext) => RouteMap<{ [K in keyof T]: K & string }> {
  return (ctx: AppContext) => {
    const handlerMap = {} as RouteMap<{ [K in keyof T]: K & string }>;
    const map = mapper(ctx);
    for (const path in map) {
      const def = map[path];
      if (def instanceof Response || typeof def === "function") {
        handlerMap[path] = { GET: def } as RouteDefinition<typeof path>;
      } else {
        handlerMap[path] = def as RouteDefinition<typeof path>;
      }
    }
    return handlerMap;
  };
}

export function createDefaultHandler(ctx: AppContext): RouteHandler<string> {
  const { logger, config } = ctx;
  return (req: Request): Response | Promise<Response> => {
    const url = new URL(req.url);
    const start = performance.now();

    if (req.method === "OPTIONS") {
      const res = options();
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
    if (contentLength > config.maxBodySize) {
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
  };
}
