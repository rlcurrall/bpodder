import { toErrorResponse } from "../lib/errors";

export function createErrorHandlingMiddleware(
  ctx: AppContext,
): <T extends string>(handler: RouteDefinition<T>) => RouteDefinition<T> {
  const { logger } = ctx;

  // Error handling wrapper for individual route handlers
  const withErrorHandling = <T extends string>(handler: RouteHandler<T>): RouteHandler<T> => {
    return async (req, s) => {
      try {
        return await handler(req, s);
      } catch (err) {
        return toErrorResponse(err, logger);
      }
    };
  };

  // Wrap a route handler, handling both single handlers and method objects
  return <T extends string>(handler: RouteDefinition<T>): RouteDefinition<T> => {
    // Static response - no error handling needed (returned as-is by toErrorResponse)
    if (handler instanceof Response) {
      return handler;
    }

    // Single function handler - wrap with error handling
    if (typeof handler === "function") {
      return withErrorHandling<T>(handler);
    }

    // It's a method object like { GET: ..., PUT: ... }
    // Wrap each function-valued method individually
    const wrapped: RouteDefinition<T> = {};
    for (const [method, fn] of Object.entries(handler)) {
      if (typeof fn === "function") {
        wrapped[method as keyof ObjectRouteDefinition<T>] = withErrorHandling<T>(fn);
      } else {
        // Static Response value for this method
        wrapped[method as keyof ObjectRouteDefinition<T>] = fn;
      }
    }
    return wrapped;
  };
}
