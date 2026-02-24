type RouteHandler<T extends string> = Bun.Serve.Handler<
  Bun.BunRequest<T>,
  Bun.Server<WebSocketData>,
  Response
>;

type RouteDefinition<T extends string, WebSocketData = undefined> = Partial<
  Record<Bun.Serve.HTTPMethod, RouteHandler<T> | Response>
>;
