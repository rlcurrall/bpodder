export interface MockRssServer {
  url: string;
  stop(): void;
}

export interface MockFixture {
  body: string;
  contentType?: string;
  status?: number;
  delay?: number;
}

export function startMockRssServer(
  fixtures: Record<string, MockFixture | string>
): MockRssServer {
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const path = new URL(req.url).pathname;
      const fixture = fixtures[path];
      if (!fixture) {
        return new Response("Not Found", { status: 404 });
      }
      
      const config: MockFixture = typeof fixture === "string"
        ? { body: fixture }
        : fixture;
      
      if (config.delay) {
        await Bun.sleep(config.delay);
      }
      
      return new Response(config.body, {
        status: config.status ?? 200,
        headers: { "Content-Type": config.contentType ?? "application/rss+xml" },
      });
    },
  });

  return {
    url: `http://localhost:${server.port}`,
    stop: () => server.stop(true),
  };
}
