import { describe, test, expect, beforeAll } from "bun:test";

import { Client } from "./helpers/client";
import { getServerUrl } from "./helpers/server";
import { createTestUser, type TestUser } from "./helpers/setup";

describe("settings", () => {
  let serverUrl: string;
  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    serverUrl = getServerUrl();
    alice = await createTestUser(serverUrl, {
      username: `alice_settings_${Date.now()}`,
      password: "password123",
    });
    bob = await createTestUser(serverUrl, {
      username: `bob_settings_${Date.now()}`,
      password: "password123",
    });
  });

  describe("account scope", () => {
    test("GET account settings — empty initially", async () => {
      const res = await alice.client.get(`/api/2/settings/${alice.username}/account.json`);
      expect(res.status).toBe(200);
      const body = await alice.client.json(res);
      expect(body).toEqual({});
    });

    test("POST set account settings", async () => {
      const res = await alice.client.post(`/api/2/settings/${alice.username}/account.json`, {
        set: { theme: "dark", language: "en" },
        remove: [],
      });
      expect(res.status).toBe(200);
      const body = await alice.client.json(res);
      expect(body).toEqual({ theme: "dark", language: "en" });
    });

    test("GET account settings — returns saved values", async () => {
      const res = await alice.client.get(`/api/2/settings/${alice.username}/account.json`);
      expect(res.status).toBe(200);
      const body = await alice.client.json(res);
      expect(body.theme).toBe("dark");
      expect(body.language).toBe("en");
    });

    test("POST update and remove account settings", async () => {
      // First set some values
      await alice.client.post(`/api/2/settings/${alice.username}/account.json`, {
        set: { theme: "dark", language: "en", notifications: true },
        remove: [],
      });

      // Now update theme and remove language
      const res = await alice.client.post(`/api/2/settings/${alice.username}/account.json`, {
        set: { theme: "light" },
        remove: ["language"],
      });
      expect(res.status).toBe(200);
      const body = await alice.client.json(res);
      expect(body.theme).toBe("light");
      expect(body.notifications).toBe(true);
      expect(body.language).toBeUndefined();
    });
  });

  describe("device scope", () => {
    test("GET device settings without device param — 400", async () => {
      const res = await alice.client.get(`/api/2/settings/${alice.username}/device.json`);
      expect(res.status).toBe(400);
    });

    test("device scope — set and get settings", async () => {
      // First create a device
      await alice.client.post(`/api/2/devices/${alice.username}/phone.json`, {
        caption: "Phone",
        type: "mobile",
      });

      const res = await alice.client.post(
        `/api/2/settings/${alice.username}/device.json?device=phone`,
        {
          set: { autoplay: true, volume: 0.8 },
          remove: [],
        },
      );
      expect(res.status).toBe(200);
      const body = await alice.client.json(res);
      expect(body.autoplay).toBe(true);
      expect(body.volume).toBe(0.8);
    });

    test("device scope — different devices have separate settings", async () => {
      // Create second device
      await alice.client.post(`/api/2/devices/${alice.username}/tablet.json`, {
        caption: "Tablet",
        type: "tablet",
      });

      // Set different settings for each device
      await alice.client.post(`/api/2/settings/${alice.username}/device.json?device=phone`, {
        set: { theme: "dark" },
        remove: [],
      });

      await alice.client.post(`/api/2/settings/${alice.username}/device.json?device=tablet`, {
        set: { theme: "light" },
        remove: [],
      });

      // Verify phone settings
      const phoneRes = await alice.client.get(
        `/api/2/settings/${alice.username}/device.json?device=phone`,
      );
      const phoneBody = await alice.client.json(phoneRes);
      expect(phoneBody.theme).toBe("dark");

      // Verify tablet settings
      const tabletRes = await alice.client.get(
        `/api/2/settings/${alice.username}/device.json?device=tablet`,
      );
      const tabletBody = await alice.client.json(tabletRes);
      expect(tabletBody.theme).toBe("light");
    });
  });

  describe("podcast scope", () => {
    test("GET podcast settings without podcast param — 400", async () => {
      const res = await alice.client.get(`/api/2/settings/${alice.username}/podcast.json`);
      expect(res.status).toBe(400);
    });

    test("podcast scope — set and get settings", async () => {
      const podcastUrl = "https://feeds.example.com/test-podcast.xml";

      const res = await alice.client.post(
        `/api/2/settings/${alice.username}/podcast.json?podcast=${encodeURIComponent(podcastUrl)}`,
        {
          set: { speed: 1.5, autoDownload: false },
          remove: [],
        },
      );
      expect(res.status).toBe(200);
      const body = await alice.client.json(res);
      expect(body.speed).toBe(1.5);
      expect(body.autoDownload).toBe(false);
    });
  });

  describe("episode scope", () => {
    test("GET episode settings without params — 400", async () => {
      const res = await alice.client.get(`/api/2/settings/${alice.username}/episode.json`);
      expect(res.status).toBe(400);
    });

    test("episode scope — requires both podcast and episode params", async () => {
      const res = await alice.client.get(
        `/api/2/settings/${alice.username}/episode.json?podcast=https://example.com/podcast.xml`,
      );
      expect(res.status).toBe(400);
    });

    test("episode scope — set and get settings", async () => {
      const podcastUrl = "https://feeds.example.com/test-podcast.xml";
      const episodeUrl = "https://example.com/episode1.mp3";

      const res = await alice.client.post(
        `/api/2/settings/${alice.username}/episode.json?podcast=${encodeURIComponent(podcastUrl)}&episode=${encodeURIComponent(episodeUrl)}`,
        {
          set: { position: 120, completed: false },
          remove: [],
        },
      );
      expect(res.status).toBe(200);
      const body = await alice.client.json(res);
      expect(body.position).toBe(120);
      expect(body.completed).toBe(false);
    });
  });

  describe("authentication and authorization", () => {
    test("GET settings as current user", async () => {
      const res = await alice.client.get(`/api/2/settings/current/account.json`);
      expect(res.status).toBe(200);
    });

    test("GET another user's settings — 403", async () => {
      const res = await alice.client.get(`/api/2/settings/${bob.username}/account.json`);
      expect(res.status).toBe(403);
    });

    test("POST another user's settings — 403", async () => {
      const res = await alice.client.post(`/api/2/settings/${bob.username}/account.json`, {
        set: { theme: "dark" },
        remove: [],
      });
      expect(res.status).toBe(403);
    });

    test("unauthenticated request — 401", async () => {
      const client = new Client(serverUrl);
      const res = await client.get(`/api/2/settings/${alice.username}/account.json`);
      expect(res.status).toBe(401);
    });
  });

  describe("invalid scope", () => {
    test("GET with invalid scope — 400", async () => {
      const res = await alice.client.get(`/api/2/settings/${alice.username}/invalid.json`);
      expect(res.status).toBe(400);
    });

    test("POST with invalid scope — 400", async () => {
      const res = await alice.client.post(`/api/2/settings/${alice.username}/invalid.json`, {
        set: { key: "value" },
        remove: [],
      });
      expect(res.status).toBe(400);
    });
  });

  describe("value types", () => {
    test("supports various JSON value types", async () => {
      const res = await alice.client.post(`/api/2/settings/${alice.username}/account.json`, {
        set: {
          string: "hello",
          number: 42,
          boolean: true,
          null: null,
          array: [1, 2, 3],
          object: { nested: "value" },
        },
        remove: [],
      });
      expect(res.status).toBe(200);
      const body = await alice.client.json(res);
      expect(body.string).toBe("hello");
      expect(body.number).toBe(42);
      expect(body.boolean).toBe(true);
      expect(body.null).toBeNull();
      expect(body.array).toEqual([1, 2, 3]);
      expect(body.object).toEqual({ nested: "value" });
    });

    test("values round-trip correctly after GET", async () => {
      // Set values
      await alice.client.post(`/api/2/settings/${alice.username}/account.json`, {
        set: { testValue: { nested: [1, 2, 3] } },
        remove: [],
      });

      // Get and verify
      const res = await alice.client.get(`/api/2/settings/${alice.username}/account.json`);
      const body = await alice.client.json(res);
      expect(body.testValue).toEqual({ nested: [1, 2, 3] });
    });
  });
});
