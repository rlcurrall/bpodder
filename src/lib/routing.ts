import { handleOptions, error } from "./response";

export function createDefaultHandler(ctx: AppContext): RouteHandler<string> {
  const { logger, config } = ctx;
  return (req: Request): Response | Promise<Response> => {
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

export function createLoggingMiddleware(
  ctx: AppContext,
): <T extends string>(
  handler: RouteHandler<T> | RouteDefinition<T>,
) => RouteHandler<T> | RouteDefinition<T> {
  const { logger } = ctx;

  // Request logging wrapper
  const withLogging = <T extends string>(handler: RouteHandler<T>): RouteHandler<T> => {
    return async (req, s) => {
      const start = performance.now();
      const res = await handler(req, s);
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
  };

  // Wrap a route handler, handling both single handlers and method objects
  return <T extends string>(
    handler: RouteHandler<T> | RouteDefinition<T>,
  ): RouteHandler<T> | RouteDefinition<T> => {
    if (typeof handler === "function") {
      return withLogging<T>(handler);
    }
    // It's a method object like { GET: ..., PUT: ... }
    const wrapped: RouteDefinition<T> = {};
    for (const [method, fn] of Object.entries(handler)) {
      if (typeof fn === "function") {
        wrapped[method as keyof RouteDefinition<T>] = withLogging<T>(fn);
      } else {
        wrapped[method as keyof RouteDefinition<T>] = fn;
      }
    }
    return wrapped;
  };
}
