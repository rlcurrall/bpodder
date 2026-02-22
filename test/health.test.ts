import { describe, test, expect, beforeAll } from "bun:test";
import { getServerUrl } from "./helpers/server";
import { Client } from "./helpers/client";

describe("health", () => {
  let serverUrl: string;
  let client: Client;

  beforeAll(async () => {
    serverUrl = getServerUrl();
    client = new Client(serverUrl);
  });

  test("GET /health returns 200", async () => {
    const res = await client.get("/health");
    expect(res.status).toBe(200);
  });

  test("GET /health returns expected body", async () => {
    const res = await client.get("/health");
    const body = await res.text();
    // Should indicate service is healthy
    expect(body.length).toBeGreaterThan(0);
  });

  test("GET /health has CORS headers", async () => {
    const res = await client.get("/health");
    const corsHeader = res.headers.get("Access-Control-Allow-Origin");
    expect(corsHeader).toBe("*");
  });
});
