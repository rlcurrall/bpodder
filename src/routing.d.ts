type RouteHandler<
  T extends string,
  WebSocketData = undefined,
  Req extends Bun.BunRequest<T> = Bun.BunRequest<T>,
> = Bun.Serve.Handler<Req, Bun.Server<WebSocketData>, Response>;

type ObjectRouteDefinition<
  T extends string,
  WebSocketData = undefined,
  Req extends Bun.BunRequest<T> = Bun.BunRequest<T>,
> = Partial<Record<Bun.Serve.HTTPMethod, RouteHandler<T, WebSocketData, Req> | Response>>;

type RouteDefinition<
  T extends string,
  WebSocketData = undefined,
  Req extends Bun.BunRequest<T> = Bun.BunRequest<T>,
> = Response | RouteHandler<T, WebSocketData, Req> | ObjectRouteDefinition<T, WebSocketData, Req>;
