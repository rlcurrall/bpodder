import { describe, test, expect, beforeAll } from "bun:test";

import { Client } from "./helpers/client";
import { getServerUrl } from "./helpers/server";

describe("registration", () => {
  let serverUrl: string;

  beforeAll(() => {
    serverUrl = getServerUrl();
  });

  test("1. POST /register with valid username + password", async () => {
    const client = new Client(serverUrl);
    const username = `reguser_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const res = await client.post("/api/b-ext/register", {
      username,
      password: "password123",
      passwordConfirm: "password123",
      captcha: "dummy",
      cc: "dummy",
    });
    expect(res.status).toBe(200);

    // Verify user can log in with Basic auth
    const loginRes = await client
      .withBasicAuth(username, "password123")
      .post(`/api/2/auth/${username}/login.json`);
    expect(loginRes.status).toBe(200);
    expect(loginRes.headers.get("Set-Cookie")).toContain("sessionid=");
  });

  test("2. Register with username 'current' (reserved)", async () => {
    const client = new Client(serverUrl);
    const res = await client.post("/api/b-ext/register", {
      username: "current",
      password: "password123",
      passwordConfirm: "password123",
      captcha: "dummy",
      cc: "dummy",
    });
    expect(res.status).toBe(400);
  });

  test("3. Register with username starting with ! (non-word char)", async () => {
    const client = new Client(serverUrl);
    const res = await client.post("/api/b-ext/register", {
      username: "!invalid",
      password: "password123",
      passwordConfirm: "password123",
      captcha: "dummy",
      cc: "dummy",
    });
    expect(res.status).toBe(400);
  });

  test("4. Register with username containing /", async () => {
    const client = new Client(serverUrl);
    const res = await client.post("/api/b-ext/register", {
      username: "user/name",
      password: "password123",
      passwordConfirm: "password123",
      captcha: "dummy",
      cc: "dummy",
    });
    expect(res.status).toBe(400);
  });

  test("5. Register with password < 8 chars", async () => {
    const client = new Client(serverUrl);
    const res = await client.post("/api/b-ext/register", {
      username: "shortpass",
      password: "1234567",
      passwordConfirm: "1234567",
      captcha: "dummy",
      cc: "dummy",
    });
    expect(res.status).toBe(400);
  });

  test("6. Register with mismatched passwordConfirm", async () => {
    const client = new Client(serverUrl);
    const res = await client.post("/api/b-ext/register", {
      username: "mismatch",
      password: "password123",
      passwordConfirm: "differentpassword",
      captcha: "dummy",
      cc: "dummy",
    });
    expect(res.status).toBe(400);
  });

  test("7. Register duplicate username", async () => {
    const client = new Client(serverUrl);
    const username = "duplicate_user";

    // First registration
    await client.post("/api/b-ext/register", {
      username,
      password: "password123",
      passwordConfirm: "password123",
      captcha: "dummy",
      cc: "dummy",
    });

    // Second registration with same username
    const res = await client.post("/api/b-ext/register", {
      username,
      password: "different123",
      passwordConfirm: "different123",
      captcha: "dummy",
      cc: "dummy",
    });
    expect(res.status).toBe(400);
  });

  // Test 8 removed - cannot test ENABLE_REGISTRATION=false with external server
  // This is a configuration guard test, not core API behavior

  test("8. Registered user can immediately login and use API", async () => {
    const client = new Client(serverUrl);
    const username = "fullflowuser";

    // Register
    await client.post("/api/b-ext/register", {
      username,
      password: "password123",
      passwordConfirm: "password123",
      captcha: "dummy",
      cc: "dummy",
    });

    // Login with Basic auth
    const loginRes = await client
      .withBasicAuth(username, "password123")
      .post(`/api/2/auth/${username}/login.json`);
    expect(loginRes.status).toBe(200);
    const sessionCookie = loginRes.headers.get("Set-Cookie");

    // Use API
    const authClient = new Client(serverUrl)
      .withBasicAuth(username, "password123")
      .withCookie(sessionCookie ?? "");

    const devicesRes = await authClient.get(`/api/2/devices/${username}.json`);
    expect(devicesRes.status).toBe(200);
  });
});
