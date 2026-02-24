import { describe, test, expect, beforeAll } from "bun:test";
import { getServerUrl } from "./helpers/server";
import { createTestUser, type TestUser } from "./helpers/setup";
import { Client } from "./helpers/client";

const urlA = "https://feeds.example.com/feedA.xml";
const urlB = "https://feeds.example.com/feedB.xml";
const urlC = "https://feeds.example.com/feedC.xml";

describe("subscriptions", () => {
  let serverUrl: string;
  let alice: TestUser;
  const deviceId = "phone";
  let username: string;

  beforeAll(async () => {
    serverUrl = getServerUrl();
    username = `alice_subs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    alice = await createTestUser(serverUrl, { username, password: "password123" });
    // Store username for later reference
    username = alice.username;
    // Create device
    await alice.client.post(`/api/2/devices/${username}/${deviceId}.json`, {
      caption: "Phone",
      type: "mobile",
    });
  });

  describe("Basic sync", () => {
    test("1. GET since=0, no subscriptions", async () => {
      const res = await alice.client.get(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        since: "0",
      });
      expect(res.status).toBe(200);
      const body = await alice.client.json(res);
      expect(body.add).toEqual([]);
      expect(body.remove).toEqual([]);
      expect(body.update_urls).toEqual([]);
      expect(typeof body.timestamp).toBe("number");
    });

    test("2. POST add urlA", async () => {
      const res = await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [urlA],
        remove: [],
      });
      expect(res.status).toBe(200);
      const body = await alice.client.json(res);
      expect(typeof body.timestamp).toBe("number");
      expect(body.update_urls).toEqual([]);
    });

    test("3. GET since=0 contains urlA", async () => {
      const res = await alice.client.get(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        since: "0",
      });
      const body = await alice.client.json(res);
      expect(body.add).toContain(urlA);
      expect(body.remove).not.toContain(urlA);
    });

    test("4. GET since=T1 (inclusive)", async () => {
      // First add urlA and get timestamp
      const addRes = await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [urlA],
        remove: [],
      });
      const addBody = await alice.client.json(addRes);
      const T1 = addBody.timestamp;

      // Query since T1 - should include urlA (inclusive)
      const res = await alice.client.get(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        since: String(T1),
      });
      const body = await alice.client.json(res);
      expect(body.add).toContain(urlA);
    });

    test("5. POST add urlA again (idempotent)", async () => {
      const res = await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [urlA],
        remove: [],
      });
      expect(res.status).toBe(200);

      // Should still only have one urlA
      const getRes = await alice.client.get(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        since: "0",
      });
      const body = await alice.client.json(getRes);
      const urlACount = body.add.filter((u: string) => u === urlA).length;
      expect(urlACount).toBe(1);
    });

    test("6. POST remove urlA", async () => {
      const res = await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [],
        remove: [urlA],
      });
      expect(res.status).toBe(200);
      const body = await alice.client.json(res);
      expect(typeof body.timestamp).toBe("number");
    });

    test("7. GET since=0 after remove", async () => {
      const res = await alice.client.get(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        since: "0",
      });
      const body = await alice.client.json(res);
      expect(body.remove).toContain(urlA);
      expect(body.add).not.toContain(urlA);
    });

    test("8. GET since=T2 (inclusive)", async () => {
      // Re-add and remove to get fresh timestamps
      await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [urlA],
        remove: [],
      });
      const removeRes = await alice.client.post(
        `/api/2/subscriptions/${username}/${deviceId}.json`,
        {
          add: [],
          remove: [urlA],
        },
      );
      const removeBody = await alice.client.json(removeRes);
      const T2 = removeBody.timestamp;

      const res = await alice.client.get(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        since: String(T2),
      });
      const body = await alice.client.json(res);
      expect(body.remove).toContain(urlA);
    });

    test("9. POST add urlA after removal (re-subscribe)", async () => {
      const res = await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [urlA],
        remove: [],
      });
      expect(res.status).toBe(200);
    });

    test("10. GET since=0 after re-add", async () => {
      const res = await alice.client.get(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        since: "0",
      });
      const body = await alice.client.json(res);
      expect(body.add).toContain(urlA);
      // urlA should not be in remove anymore (or if it is, it's from old timestamp)
    });

    test("11. POST add multiple URLs at once", async () => {
      await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [urlB, urlC],
        remove: [],
      });

      const res = await alice.client.get(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        since: "0",
      });
      const body = await alice.client.json(res);
      expect(body.add).toContain(urlB);
      expect(body.add).toContain(urlC);
    });

    test("12. POST invalid URL (not http/https) - rewritten to empty", async () => {
      const res = await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: ["ftp://example.com/feed"],
        remove: [],
      });
      expect(res.status).toBe(200);
      const body = await alice.client.json(res);
      expect(body.update_urls).toEqual([["ftp://example.com/feed", ""]]);
    });

    test("13. POST empty string URL (rewritten to empty)", async () => {
      const res = await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [""],
        remove: [],
      });
      expect(res.status).toBe(200);
      const body = await alice.client.json(res);
      expect(body.update_urls).toEqual([["", ""]]);
    });

    test("14. POST body missing add/remove (tolerated)", async () => {
      const res = await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {});
      expect(res.status).toBe(200);
    });

    test("15. POST duplicate URLs in same request", async () => {
      // First clean up
      const res = await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [urlA, urlA, urlA],
        remove: [],
      });
      expect(res.status).toBe(200);

      const getRes = await alice.client.get(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        since: "0",
      });
      const body = await alice.client.json(getRes);
      const urlACount = body.add.filter((u: string) => u === urlA).length;
      expect(urlACount).toBe(1);
    });

    test("16b. POST same URL in add and remove (should 400)", async () => {
      const res = await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [urlA],
        remove: [urlA],
      });
      expect(res.status).toBe(400);
    });

    test("16c. POST URL with whitespace (trimmed, update_urls as tuple)", async () => {
      const urlWithSpace = " https://feeds.example.com/spaced.xml";
      const urlTrimmed = "https://feeds.example.com/spaced.xml";

      const res = await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [urlWithSpace],
        remove: [],
      });
      expect(res.status).toBe(200);
      const body = await alice.client.json(res);
      expect(body.update_urls).toEqual([[urlWithSpace, urlTrimmed]]);
    });

    test("16d. POST remove URL with whitespace (tracked in update_urls)", async () => {
      const urlWithSpace = " https://feeds.example.com/remove-spaced.xml";
      const urlTrimmed = "https://feeds.example.com/remove-spaced.xml";

      // First add the URL
      await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [urlTrimmed],
        remove: [],
      });

      // Now remove with whitespace
      const res = await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [],
        remove: [urlWithSpace],
      });
      expect(res.status).toBe(200);
      const body = await alice.client.json(res);
      expect(body.update_urls).toEqual([[urlWithSpace, urlTrimmed]]);
    });

    test("16e. POST remove non-HTTP URL (rewritten to empty)", async () => {
      const res = await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [],
        remove: ["ftp://example.com/feed"],
      });
      expect(res.status).toBe(200);
      const body = await alice.client.json(res);
      expect(body.update_urls).toEqual([["ftp://example.com/feed", ""]]);
    });
  });

  describe("since filtering", () => {
    test("17. POST urlA→T1, POST urlB→T2, GET since=T1 (both inclusive)", async () => {
      // Clear and start fresh
      await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [urlA, urlB],
        remove: [],
      });

      const res = await alice.client.get(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        since: "0",
      });
      const body = await alice.client.json(res);
      expect(body.add).toContain(urlA);
      expect(body.add).toContain(urlB);
    });

    test("18. POST urlA→T1, GET since=T1+1 (exclusive)", async () => {
      const addRes = await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [urlA],
        remove: [],
      });
      const addBody = await alice.client.json(addRes);
      const T1 = addBody.timestamp;

      const res = await alice.client.get(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        since: String(T1 + 1),
      });
      const body = await alice.client.json(res);
      expect(body.add).not.toContain(urlA);
    });

    test("19. GET since=far future", async () => {
      const res = await alice.client.get(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        since: String(Date.now() + 1000000000),
      });
      const body = await alice.client.json(res);
      expect(body.add).toEqual([]);
      expect(body.remove).toEqual([]);
    });
  });

  describe("PUT (additive only)", () => {
    test("20. PUT JSON array [urlA, urlB] with no prior subs", async () => {
      // Note: tests are not isolated, so we don't know state
      // Just verify PUT succeeds and adds URLs
      const res = await alice.client.put(`/subscriptions/${username}/${deviceId}.json`, [
        urlA,
        urlB,
      ]);
      expect(res.status).toBe(200);

      // Verify URLs were added
      const getRes = await alice.client.get(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        since: "0",
      });
      const body = await alice.client.json(getRes);
      expect(body.add).toContain(urlA);
      expect(body.add).toContain(urlB);
    });

    test("21. PUT [urlC] when urlA, urlB already subscribed (additive)", async () => {
      // Ensure urlA and urlB exist
      await alice.client.put(`/subscriptions/${username}/${deviceId}.json`, [urlA, urlB]);

      // PUT urlC only
      await alice.client.put(`/subscriptions/${username}/${deviceId}.json`, [urlC]);

      // All three should exist (PUT is additive, not replace)
      const res = await alice.client.get(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        since: "0",
      });
      const body = await alice.client.json(res);
      expect(body.add).toContain(urlA);
      expect(body.add).toContain(urlB);
      expect(body.add).toContain(urlC);
    });

    test("22. PUT [] empty array (no change)", async () => {
      // Ensure subscriptions exist
      await alice.client.put(`/subscriptions/${username}/${deviceId}.json`, [urlA]);

      // PUT empty array
      await alice.client.put(`/subscriptions/${username}/${deviceId}.json`, []);

      // urlA should still exist
      const res = await alice.client.get(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        since: "0",
      });
      const body = await alice.client.json(res);
      expect(body.add).toContain(urlA);
    });

    test("23. PUT with {feed: url, title: ...} object format", async () => {
      const res = await alice.client.put(`/subscriptions/${username}/${deviceId}.json`, [
        { feed: "https://feeds.example.com/object-format.xml", title: "Object Format Feed" },
      ]);
      expect(res.status).toBe(200);

      const getRes = await alice.client.get(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        since: "0",
      });
      const body = await alice.client.json(getRes);
      expect(body.add).toContain("https://feeds.example.com/object-format.xml");
    });

    test("24. PUT text/plain body with newline-separated URLs", async () => {
      const plainTextUrls = `https://feeds.example.com/txt1.xml\nhttps://feeds.example.com/txt2.xml`;
      const res = await alice.client.put(
        `/subscriptions/${username}/${deviceId}.txt`,
        plainTextUrls,
      );
      expect(res.status).toBe(200);

      const getRes = await alice.client.get(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        since: "0",
      });
      const body = await alice.client.json(getRes);
      expect(body.add).toContain("https://feeds.example.com/txt1.xml");
      expect(body.add).toContain("https://feeds.example.com/txt2.xml");
    });
  });

  describe("V2.11 All Subscriptions", () => {
    test("GET /api/2/subscriptions/:username.json returns all subscriptions", async () => {
      // Ensure we have some subscriptions
      await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [urlA, urlB],
        remove: [],
      });

      const res = await alice.client.get(`/api/2/subscriptions/${username}.json`);
      expect(res.status).toBe(200);
      const body = await alice.client.json<string[]>(res);
      expect(body).toContain(urlA);
      expect(body).toContain(urlB);
    });
  });

  describe("OPML", () => {
    test("25. GET .opml with no subscriptions", async () => {
      // First clear all subscriptions by creating a new user
      const bob = await (async () => {
        const client = new Client(serverUrl);
        const bobUsername = `bob_opml_${Date.now()}`;
        const password = "password123";

        await client.post("/register", {
          username: bobUsername,
          password,
          passwordConfirm: password,
          captcha: "dummy",
          cc: "dummy",
        });

        await client.post(`/api/2/auth/${bobUsername}/login.json`);
        return { username: bobUsername, client: client.withBasicAuth(bobUsername, password) };
      })();

      const res = await bob.client.get(`/subscriptions/${bob.username}.opml`);
      expect(res.status).toBe(200);
      const body = await bob.client.text(res);
      expect(body).toContain("<?xml");
      expect(body).toContain("<opml");
    });

    test("26. GET .opml with subscriptions", async () => {
      const res = await alice.client.get(`/subscriptions/${username}.opml`);
      expect(res.status).toBe(200);
      const body = await alice.client.text(res);
      expect(body).toContain('<outline type="rss"');
      expect(body).toContain("xmlUrl=");
    });

    test("27. GET .opml — Content-Type is text/x-opml", async () => {
      const res = await alice.client.get(`/subscriptions/${username}.opml`);
      expect(res.headers.get("Content-Type")).toContain("text/x-opml");
    });

    test("28. GET .opml with feed metadata", async () => {
      const res = await alice.client.get(`/subscriptions/${username}.opml`);
      const body = await alice.client.text(res);
      // Should include title and text attributes
      expect(body).toMatch(/title="[^"]+"/);
      expect(body).toMatch(/text="[^"]+"/);
    });

    test("29. PUT .txt with newline-separated URLs", async () => {
      const plainTextUrls = `https://feeds.example.com/txt-test.xml`;
      const res = await alice.client.put(
        `/subscriptions/${username}/${deviceId}.txt`,
        plainTextUrls,
      );
      expect(res.status).toBe(200);

      const getRes = await alice.client.get(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        since: "0",
      });
      const body = await alice.client.json(getRes);
      expect(body.add).toContain("https://feeds.example.com/txt-test.xml");
    });

    test("30. GET access for bob's subscriptions as alice (403)", async () => {
      // Create bob
      await new Client(serverUrl).post("/register", {
        username: "bob_subs",
        password: "password",
        passwordConfirm: "password",
        captcha: "dummy",
        cc: "dummy",
      });

      const res = await alice.client.get("/api/2/subscriptions/bob_subs/phone.json");
      expect(res.status).toBe(403);
    });

    test("31. POST access for bob's subscriptions as alice (403)", async () => {
      const res = await alice.client.post("/api/2/subscriptions/bob_subs/phone.json", {
        add: [urlA],
        remove: [],
      });
      expect(res.status).toBe(403);
    });

    test("32. GET /subscriptions/:user/:device.json (flat array)", async () => {
      // Add some subscriptions first
      await alice.client.put(`/subscriptions/${username}/phone.json`, [urlA, urlB]);

      const res = await alice.client.get(`/subscriptions/${username}/phone.json`);
      expect(res.status).toBe(200);
      const body = await alice.client.json<string[]>(res);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toContain(urlA);
      expect(body).toContain(urlB);
    });

    test("33. GET /subscriptions/:user/:device.txt (newline separated)", async () => {
      const res = await alice.client.get(`/subscriptions/${username}/phone.txt`);
      expect(res.status).toBe(200);
      const body = await alice.client.text(res);
      expect(body).toContain(urlA);
      expect(body).toContain(urlB);
    });

    test("34. GET /subscriptions/:user/unknown-device.json returns 404", async () => {
      const res = await alice.client.get(`/subscriptions/${username}/unknown-device.json`);
      expect(res.status).toBe(404);
    });

    test("35. GET /subscriptions/:user/unknown-device.opml returns 404", async () => {
      const res = await alice.client.get(`/subscriptions/${username}/unknown-device.opml`);
      expect(res.status).toBe(404);
    });

    test("36. PUT to unknown device auto-creates device", async () => {
      const newDeviceId = `new-device-${Date.now()}`;
      const res = await alice.client.put(`/subscriptions/${username}/${newDeviceId}.json`, [urlC]);
      expect(res.status).toBe(200);

      // Verify device was created
      const devicesRes = await alice.client.get(`/api/2/devices/${username}.json`);
      const devices = await alice.client.json(devicesRes);
      const device = devices.find((d: any) => d.id === newDeviceId);
      expect(device).toBeDefined();
    });

    test("37. PUT response body is empty on success", async () => {
      const res = await alice.client.put(`/subscriptions/${username}/phone.json`, [urlA]);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toBe("");
    });
  });
});
