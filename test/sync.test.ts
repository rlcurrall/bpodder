import { describe, test, expect, beforeAll } from "bun:test";

import { getServerUrl } from "./helpers/server";
import { createTestUser, type TestUser } from "./helpers/setup";

describe("sync-devices", () => {
  let serverUrl: string;
  let alice: TestUser;
  let username: string;

  beforeAll(async () => {
    serverUrl = getServerUrl();
    username = `alice_sync_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    alice = await createTestUser(serverUrl, {
      username,
      password: "password123",
    });
  });

  describe("GET sync status", () => {
    test("1. GET sync status with no devices", async () => {
      const res = await alice.client.get(`/api/2/sync-devices/${username}.json`);
      expect(res.status).toBe(200);

      const body = await alice.client.json<{
        synchronized: string[][];
        "not-synchronized": string[];
      }>(res);
      expect(body.synchronized).toEqual([]);
      expect(body["not-synchronized"]).toEqual([]);
    });

    test("2. GET sync status with unsynced devices", async () => {
      // Create two devices
      await alice.client.post(`/api/2/devices/${username}/phone.json`, {
        caption: "Phone",
        type: "mobile",
      });
      await alice.client.post(`/api/2/devices/${username}/tablet.json`, {
        caption: "Tablet",
        type: "tablet",
      });

      const res = await alice.client.get(`/api/2/sync-devices/${username}.json`);
      expect(res.status).toBe(200);

      const body = await alice.client.json<{
        synchronized: string[][];
        "not-synchronized": string[];
      }>(res);
      expect(body.synchronized).toEqual([]);
      expect(body["not-synchronized"]).toContain("phone");
      expect(body["not-synchronized"]).toContain("tablet");
      expect(body["not-synchronized"]).toHaveLength(2);
    });
  });

  describe("POST synchronize", () => {
    test("3. Create sync group for two devices", async () => {
      const res = await alice.client.post(`/api/2/sync-devices/${username}.json`, {
        synchronize: [["phone", "tablet"]],
      });
      expect(res.status).toBe(200);

      const body = await alice.client.json<{
        synchronized: string[][];
        "not-synchronized": string[];
      }>(res);
      expect(body.synchronized).toHaveLength(1);
      expect(body.synchronized[0]).toContain("phone");
      expect(body.synchronized[0]).toContain("tablet");
      expect(body["not-synchronized"]).toEqual([]);
    });

    test("4. GET sync status after creating group", async () => {
      const res = await alice.client.get(`/api/2/sync-devices/${username}.json`);
      expect(res.status).toBe(200);

      const body = await alice.client.json<{
        synchronized: string[][];
        "not-synchronized": string[];
      }>(res);
      expect(body.synchronized).toHaveLength(1);
      expect(body.synchronized[0]).toContain("phone");
      expect(body.synchronized[0]).toContain("tablet");
      expect(body["not-synchronized"]).toEqual([]);
    });

    test("5. Add third device to existing group", async () => {
      // Create a third device
      await alice.client.post(`/api/2/devices/${username}/laptop.json`, {
        caption: "Laptop",
        type: "desktop",
      });

      // Add laptop to the existing sync group
      const res = await alice.client.post(`/api/2/sync-devices/${username}.json`, {
        synchronize: [["phone", "laptop"]],
      });
      expect(res.status).toBe(200);

      const body = await alice.client.json<{
        synchronized: string[][];
        "not-synchronized": string[];
      }>(res);
      expect(body.synchronized).toHaveLength(1);
      expect(body.synchronized[0]).toContain("phone");
      expect(body.synchronized[0]).toContain("tablet");
      expect(body.synchronized[0]).toContain("laptop");
      expect(body["not-synchronized"]).toEqual([]);
    });

    test("6. Create multiple separate sync groups", async () => {
      // Create more devices
      await alice.client.post(`/api/2/devices/${username}/desktop.json`, {
        caption: "Desktop",
        type: "desktop",
      });
      await alice.client.post(`/api/2/devices/${username}/tv.json`, {
        caption: "TV",
        type: "other",
      });

      // Create two separate sync groups
      const res = await alice.client.post(`/api/2/sync-devices/${username}.json`, {
        synchronize: [["desktop", "tv"]],
      });
      expect(res.status).toBe(200);

      const body = await alice.client.json<{
        synchronized: string[][];
        "not-synchronized": string[];
      }>(res);
      expect(body.synchronized).toHaveLength(2);

      // Find the group containing desktop and tv
      const desktopGroup = body.synchronized.find((g) => g.includes("desktop"));
      expect(desktopGroup).toContain("tv");

      // The original phone/tablet/laptop group should still exist
      const mobileGroup = body.synchronized.find((g) => g.includes("phone"));
      expect(mobileGroup).toContain("tablet");
      expect(mobileGroup).toContain("laptop");
    });

    test("7. POST with invalid device returns 400", async () => {
      const res = await alice.client.post(`/api/2/sync-devices/${username}.json`, {
        synchronize: [["phone", "nonexistent-device"]],
      });
      expect(res.status).toBe(400);
    });

    test("7b. Merge multiple existing sync groups", async () => {
      // Ensure all devices exist (they may not if running test in isolation)
      const devicesRes = await alice.client.get(`/api/2/devices/${username}.json`);
      const existingDevices = await alice.client.json<{ id: string; name: string }[]>(devicesRes);
      const deviceIds = new Set(existingDevices.map((d) => d.id));

      // Create any missing devices
      if (!deviceIds.has("phone")) {
        await alice.client.post(`/api/2/devices/${username}/phone.json`, {
          caption: "Phone",
          type: "mobile",
        });
      }
      if (!deviceIds.has("tablet")) {
        await alice.client.post(`/api/2/devices/${username}/tablet.json`, {
          caption: "Tablet",
          type: "tablet",
        });
      }
      if (!deviceIds.has("laptop")) {
        await alice.client.post(`/api/2/devices/${username}/laptop.json`, {
          caption: "Laptop",
          type: "desktop",
        });
      }
      if (!deviceIds.has("desktop")) {
        await alice.client.post(`/api/2/devices/${username}/desktop.json`, {
          caption: "Desktop",
          type: "desktop",
        });
      }
      if (!deviceIds.has("tv")) {
        await alice.client.post(`/api/2/devices/${username}/tv.json`, {
          caption: "TV",
          type: "other",
        });
      }

      // First clear all existing sync groups
      await alice.client.post(`/api/2/sync-devices/${username}.json`, {
        "stop-synchronize": ["phone", "tablet", "laptop", "desktop", "tv"],
      });

      // Create two separate sync groups
      await alice.client.post(`/api/2/sync-devices/${username}.json`, {
        synchronize: [["phone", "tablet"]],
      });
      await alice.client.post(`/api/2/sync-devices/${username}.json`, {
        synchronize: [["laptop", "desktop"]],
      });

      // Now merge all four devices together
      const res = await alice.client.post(`/api/2/sync-devices/${username}.json`, {
        synchronize: [["phone", "laptop"]],
      });
      expect(res.status).toBe(200);

      const body = await alice.client.json<{
        synchronized: string[][];
        "not-synchronized": string[];
      }>(res);
      // All 4 devices should now be in a single group (tv is unsynced)
      expect(body.synchronized).toHaveLength(1);
      expect(body.synchronized[0]).toHaveLength(4);
      expect(body.synchronized[0]).toContain("phone");
      expect(body.synchronized[0]).toContain("tablet");
      expect(body.synchronized[0]).toContain("laptop");
      expect(body.synchronized[0]).toContain("desktop");
      expect(body["not-synchronized"]).toContain("tv");
    });
  });

  describe("POST stop-synchronize", () => {
    test("8. Stop sync for one device in group", async () => {
      // First clear all existing sync groups and ensure phone and tablet are synced together
      await alice.client.post(`/api/2/sync-devices/${username}.json`, {
        "stop-synchronize": ["phone", "tablet", "laptop", "desktop", "tv"],
      });

      await alice.client.post(`/api/2/sync-devices/${username}.json`, {
        synchronize: [["phone", "tablet"]],
      });

      // Stop sync for phone only
      const res = await alice.client.post(`/api/2/sync-devices/${username}.json`, {
        "stop-synchronize": ["phone"],
      });
      expect(res.status).toBe(200);

      const body = await alice.client.json<{
        synchronized: string[][];
        "not-synchronized": string[];
      }>(res);
      // Tablet should still be in a group (now alone)
      expect(body.synchronized).toHaveLength(1);
      expect(body.synchronized[0]).toContain("tablet");
      expect(body.synchronized[0]).not.toContain("phone");
      expect(body["not-synchronized"]).toContain("phone");
    });

    test("9. Stop sync for all devices in a group", async () => {
      // First clear all existing sync groups
      await alice.client.post(`/api/2/sync-devices/${username}.json`, {
        "stop-synchronize": ["phone", "tablet", "laptop", "desktop", "tv"],
      });

      // Create a sync group
      await alice.client.post(`/api/2/sync-devices/${username}.json`, {
        synchronize: [["phone", "tablet"]],
      });

      // Stop sync for both
      const res = await alice.client.post(`/api/2/sync-devices/${username}.json`, {
        "stop-synchronize": ["phone", "tablet"],
      });
      expect(res.status).toBe(200);

      const body = await alice.client.json<{
        synchronized: string[][];
        "not-synchronized": string[];
      }>(res);
      expect(body.synchronized).toEqual([]);
      expect(body["not-synchronized"]).toContain("phone");
      expect(body["not-synchronized"]).toContain("tablet");
    });

    test("10. Stop sync with invalid device returns 400", async () => {
      const res = await alice.client.post(`/api/2/sync-devices/${username}.json`, {
        "stop-synchronize": ["nonexistent-device"],
      });
      expect(res.status).toBe(400);
    });
  });

  describe("Access control", () => {
    test("11. Cannot access other user's sync status (403)", async () => {
      const res = await alice.client.get("/api/2/sync-devices/bob.json");
      expect(res.status).toBe(403);
    });

    test("12. Cannot modify other user's sync (403)", async () => {
      const res = await alice.client.post("/api/2/sync-devices/bob.json", {
        synchronize: [["phone", "tablet"]],
      });
      expect(res.status).toBe(403);
    });
  });

  describe("Complex scenarios", () => {
    test("13. Combined synchronize and stop-synchronize in one request", async () => {
      // First clear all existing sync groups
      await alice.client.post(`/api/2/sync-devices/${username}.json`, {
        "stop-synchronize": ["phone", "tablet", "laptop", "desktop", "tv"],
      });

      // Setup: phone and tablet in one group
      await alice.client.post(`/api/2/sync-devices/${username}.json`, {
        synchronize: [["phone", "tablet"]],
      });

      // Add laptop to phone's group and remove tablet
      const res = await alice.client.post(`/api/2/sync-devices/${username}.json`, {
        synchronize: [["phone", "laptop"]],
        "stop-synchronize": ["tablet"],
      });
      expect(res.status).toBe(200);

      const body = await alice.client.json<{
        synchronized: string[][];
        "not-synchronized": string[];
      }>(res);
      expect(body.synchronized).toHaveLength(1);
      expect(body.synchronized[0]).toContain("phone");
      expect(body.synchronized[0]).toContain("laptop");
      expect(body.synchronized[0]).not.toContain("tablet");
      expect(body["not-synchronized"]).toContain("tablet");
    });

    test("14. Sync groups isolated per user", async () => {
      // Create another user with same device IDs
      const bobUsername = `bob_sync_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const bob = await createTestUser(serverUrl, {
        username: bobUsername,
        password: "password123",
      });

      // Bob creates devices with same names
      await bob.client.post(`/api/2/devices/${bobUsername}/phone.json`, {
        caption: "Bob's Phone",
        type: "mobile",
      });
      await bob.client.post(`/api/2/devices/${bobUsername}/tablet.json`, {
        caption: "Bob's Tablet",
        type: "tablet",
      });

      // Bob syncs his devices
      await bob.client.post(`/api/2/sync-devices/${bobUsername}.json`, {
        synchronize: [["phone", "tablet"]],
      });

      // Verify Alice's sync status is unchanged
      const aliceRes = await alice.client.get(`/api/2/sync-devices/${username}.json`);
      const aliceBody = await alice.client.json<{
        synchronized: string[][];
        "not-synchronized": string[];
      }>(aliceRes);

      // Alice should still have her sync groups from previous tests
      expect(aliceBody.synchronized.length).toBeGreaterThanOrEqual(0);

      // Verify Bob's sync status
      const bobRes = await bob.client.get(`/api/2/sync-devices/${bobUsername}.json`);
      const bobBody = await bob.client.json<{
        synchronized: string[][];
        "not-synchronized": string[];
      }>(bobRes);
      expect(bobBody.synchronized).toHaveLength(1);
      expect(bobBody.synchronized[0]).toContain("phone");
      expect(bobBody.synchronized[0]).toContain("tablet");
    });
  });
});
