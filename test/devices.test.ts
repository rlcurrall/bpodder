import { describe, test, expect, beforeAll } from "bun:test";

import { Client } from "./helpers/client";
import { getServerUrl } from "./helpers/server";
import { createTestUser, type TestUser } from "./helpers/setup";

describe("devices", () => {
  let serverUrl: string;
  let alice: TestUser;

  beforeAll(async () => {
    serverUrl = getServerUrl();
    // Use unique username to avoid cross-test contamination
    alice = await createTestUser(serverUrl, {
      username: `alice_devices_${Date.now()}`,
      password: "password123",
    });
  });

  test("1. GET devices — no devices yet", async () => {
    const res = await alice.client.get(`/api/2/devices/${alice.username}.json`);
    expect(res.status).toBe(200);
    const body = await alice.client.json(res);
    expect(body).toEqual([]);
  });

  test("2. POST create device { caption, type }", async () => {
    const res = await alice.client.post(`/api/2/devices/${alice.username}/phone.json`, {
      caption: "Alice's Phone",
      type: "mobile",
    });
    expect(res.status).toBe(200);
  });

  test("3. GET devices after create", async () => {
    const res = await alice.client.get(`/api/2/devices/${alice.username}.json`);
    expect(res.status).toBe(200);
    const body =
      await alice.client.json<
        { id: string; caption: string | null; type: string; subscriptions: number }[]
      >(res);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: "phone",
      caption: "Alice's Phone",
      type: "mobile",
    });
    expect(typeof body[0].subscriptions).toBe("number");
  });

  test("3b. Device list includes subscriptions count", async () => {
    // First add some subscriptions
    await alice.client.post(`/api/2/subscriptions/${alice.username}/phone.json`, {
      add: ["https://feeds.example.com/podcast1.xml", "https://feeds.example.com/podcast2.xml"],
      remove: [],
    });

    const res = await alice.client.get(`/api/2/devices/${alice.username}.json`);
    const body =
      await alice.client.json<
        { id: string; caption: string | null; type: string; subscriptions: number }[]
      >(res);
    const phoneDevice = body.find((d) => d.id === "phone");
    expect(phoneDevice).toBeDefined();
    expect(phoneDevice!.subscriptions).toBeGreaterThanOrEqual(2);
  });

  test("4. POST same deviceid again with updated caption (upsert)", async () => {
    const res = await alice.client.post(`/api/2/devices/${alice.username}/phone.json`, {
      caption: "Alice's Updated Phone",
      type: "mobile",
    });
    expect(res.status).toBe(200);
  });

  test("5. GET devices — caption reflects update", async () => {
    const res = await alice.client.get(`/api/2/devices/${alice.username}.json`);
    const body =
      await alice.client.json<{ id: string; caption: string | null; type: string }[]>(res);
    const phoneDevice = body.find((d) => d.id === "phone");
    expect(phoneDevice).toBeDefined();
    expect(phoneDevice!.caption).toBe("Alice's Updated Phone");
  });

  test("6. POST second device", async () => {
    const res = await alice.client.post(`/api/2/devices/${alice.username}/tablet.json`, {
      caption: "Alice's Tablet",
      type: "tablet",
    });
    expect(res.status).toBe(200);
  });

  test("7. GET devices — both present", async () => {
    const res = await alice.client.get(`/api/2/devices/${alice.username}.json`);
    const body =
      await alice.client.json<{ id: string; caption: string | null; type: string }[]>(res);
    expect(body).toHaveLength(2);
    expect(body.map((d) => d.id)).toContain("phone");
    expect(body.map((d) => d.id)).toContain("tablet");
  });

  test("8. POST device with empty body {}", async () => {
    const res = await alice.client.post(`/api/2/devices/${alice.username}/minimal.json`, {});
    expect(res.status).toBe(200);
  });

  test("9. GET that device — present with empty/null caption", async () => {
    const res = await alice.client.get(`/api/2/devices/${alice.username}.json`);
    const body =
      await alice.client.json<{ id: string; caption: string | null; type: string }[]>(res);
    const minimalDevice = body.find((d) => d.id === "minimal");
    expect(minimalDevice).toBeDefined();
    // Caption should be null or empty, but device should exist
    expect([null, undefined, ""]).toContain(minimalDevice!.caption);
  });

  test("10. POST device — deviceid with spaces", async () => {
    const res = await alice.client.post(`/api/2/devices/${alice.username}/bad device.json`, {
      caption: "Bad Device",
    });
    expect(res.status).toBe(400);
  });

  test("11. POST device — deviceid with / slash", async () => {
    const res = await alice.client.post(`/api/2/devices/${alice.username}/bad/device.json`, {
      caption: "Bad Device",
    });
    // Bun's router treats bad/device as two path segments, so the route
    // doesn't match — 404 is the correct behavior at the framework level.
    expect([400, 404]).toContain(res.status);
  });

  test("12. GET devices for bob as alice", async () => {
    // Create bob
    await new Client(serverUrl).post("/api/b-ext/register", {
      username: "bob2",
      password: "bobpassword",
      passwordConfirm: "bobpassword",
      captcha: "dummy",
      cc: "dummy",
    });

    const res = await alice.client.get("/api/2/devices/bob2.json");
    expect(res.status).toBe(403);
  });

  test("13. GET devices as current", async () => {
    const res = await alice.client.get("/api/2/devices/current.json");
    expect(res.status).toBe(200);
    const body =
      await alice.client.json<{ id: string; caption: string | null; type: string }[]>(res);
    expect(body.length).toBeGreaterThan(0);
  });

  test("14. POST partial update - only caption, type unchanged", async () => {
    // First ensure device exists with both fields
    await alice.client.post(`/api/2/devices/${alice.username}/partial.json`, {
      caption: "Original Caption",
      type: "mobile",
    });

    // Now update only caption
    const res = await alice.client.post(`/api/2/devices/${alice.username}/partial.json`, {
      caption: "Updated Caption",
    });
    expect(res.status).toBe(200);

    // Verify type unchanged
    const getRes = await alice.client.get(`/api/2/devices/${alice.username}.json`);
    const body =
      await alice.client.json<{ id: string; caption: string | null; type: string }[]>(getRes);
    const device = body.find((d) => d.id === "partial");
    expect(device).toBeDefined();
    expect(device!.caption).toBe("Updated Caption");
    expect(device!.type).toBe("mobile");
  });

  test("15. GET devices - caption/type return empty string not null", async () => {
    // Create device with empty fields (POST {})
    await alice.client.post(`/api/2/devices/${alice.username}/empty-fields.json`, {});

    const res = await alice.client.get(`/api/2/devices/${alice.username}.json`);
    const body =
      await alice.client.json<{ id: string; caption: string | null; type: string }[]>(res);
    const device = body.find((d) => d.id === "empty-fields");
    expect(device).toBeDefined();
    // Per GPodder spec: should be empty string, not null
    expect(device!.caption).toBe("");
    expect(device!.type).toBe("");
    expect(device!.caption).not.toBeNull();
    expect(device!.type).not.toBeNull();
  });
});
