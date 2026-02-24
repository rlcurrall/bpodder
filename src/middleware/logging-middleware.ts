export type LoggingRequest<T extends string> = Bun.BunRequest<T> & { rid: string };

export function createLoggingMiddleware(
  ctx: AppContext,
): <T extends string>(handler: RouteDefinition<T>) => RouteDefinition<T> {
  const { logger } = ctx;

  // Request logging wrapper
  const withLogging = <T extends string>(handler: RouteHandler<T>): RouteHandler<T> => {
    return async (req, s) => {
      // Add request ID via mutation for log correlation
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
  return <T extends string>(handler: RouteDefinition<T>): RouteDefinition<T> => {
    if (handler instanceof Response) {
      return handler; // Static response, no logging needed
    }

    if (typeof handler === "function") {
      return withLogging<T>(handler);
    }

    // It's a method object like { GET: ..., PUT: ... }
    const wrapped: RouteDefinition<T> = {};
    for (const [method, fn] of Object.entries(handler)) {
      if (typeof fn === "function") {
        wrapped[method as keyof ObjectRouteDefinition<T>] = withLogging<T>(fn);
      } else {
        wrapped[method as keyof ObjectRouteDefinition<T>] = fn;
      }
    }
    return wrapped;
  };
}
