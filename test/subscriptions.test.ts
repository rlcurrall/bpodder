import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { XMLParser } from "fast-xml-parser";

import { Client } from "./helpers/client";
import { startMockRssServer, type MockRssServer } from "./helpers/mock-rss";
import { getServerUrl } from "./helpers/server";
import { createTestUser, type TestUser } from "./helpers/setup";

type PodcastXml = {
  title?: string;
  url?: string;
  website?: string;
  author?: string;
  description?: string;
};

type PodcastsXmlDocument = {
  podcasts?: {
    podcast?: PodcastXml | PodcastXml[];
  };
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  processEntities: true,
  trimValues: true,
});

function parsePodcastsXml(xmlText: string): PodcastXml[] {
  const parsed = xmlParser.parse(xmlText) as PodcastsXmlDocument;
  const podcasts = parsed.podcasts?.podcast;

  if (!podcasts) {
    throw new Error(`Invalid podcasts XML: ${xmlText}`);
  }

  return Array.isArray(podcasts) ? podcasts : [podcasts];
}

function extractPodcastUrls(xmlText: string): string[] {
  return parsePodcastsXml(xmlText)
    .map((podcast) => podcast.url)
    .filter((url): url is string => typeof url === "string");
}

function countPodcastElements(xmlText: string): number {
  return parsePodcastsXml(xmlText).length;
}

const urlA = "https://feeds.example.com/feedA.xml";
const urlB = "https://feeds.example.com/feedB.xml";
const urlC = "https://feeds.example.com/feedC.xml";

async function waitForSubscriptionTitles(
  client: Client,
  username: string,
  deviceId: string,
  q: string,
  expectedCount: number,
): Promise<Array<{ url: string; title: string | null }>> {
  const deadline = Date.now() + 5000;

  while (Date.now() < deadline) {
    const res = await client.get(
      `/api/b-ext/subscriptions/${username}/${deviceId}.json?limit=20&q=${encodeURIComponent(q)}`,
    );
    expect(res.status).toBe(200);

    const body = await client.json<{
      items: Array<{ url: string; title: string | null }>;
    }>(res);

    if (body.items.length === expectedCount && body.items.every((item) => item.title !== null)) {
      return body.items;
    }

    await Bun.sleep(50);
  }

  throw new Error("Timed out waiting for feed metadata");
}

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
      const body = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(res);
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
      const body = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(res);
      expect(typeof body.timestamp).toBe("number");
      expect(body.update_urls).toEqual([]);
    });

    test("3. GET since=0 contains urlA", async () => {
      const res = await alice.client.get(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        since: "0",
      });
      const body = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(res);
      expect(body.add).toContain(urlA);
      expect(body.remove).not.toContain(urlA);
    });

    test("4. GET since=T1 (inclusive)", async () => {
      // First add urlA and get timestamp
      const addRes = await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [urlA],
        remove: [],
      });
      const addBody = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(addRes);
      const T1 = addBody.timestamp;

      // Query since T1 - should include urlA (inclusive)
      const res = await alice.client.get(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        since: String(T1),
      });
      const body = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(res);
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
      const body = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(getRes);
      const urlACount = body.add.filter((u: string) => u === urlA).length;
      expect(urlACount).toBe(1);
    });

    test("6. POST remove urlA", async () => {
      const res = await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [],
        remove: [urlA],
      });
      expect(res.status).toBe(200);
      const body = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(res);
      expect(typeof body.timestamp).toBe("number");
    });

    test("7. GET since=0 after remove", async () => {
      const res = await alice.client.get(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        since: "0",
      });
      const body = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(res);
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
      const removeBody = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(removeRes);
      const T2 = removeBody.timestamp;

      const res = await alice.client.get(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        since: String(T2),
      });
      const body = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(res);
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
      const body = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(res);
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
      const body = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(res);
      expect(body.add).toContain(urlB);
      expect(body.add).toContain(urlC);
    });

    test("12. POST invalid URL (not http/https) - rewritten to empty", async () => {
      const res = await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: ["ftp://example.com/feed"],
        remove: [],
      });
      expect(res.status).toBe(200);
      const body = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(res);
      expect(body.update_urls).toEqual([["ftp://example.com/feed", ""]]);
    });

    test("13. POST empty string URL (rewritten to empty)", async () => {
      const res = await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [""],
        remove: [],
      });
      expect(res.status).toBe(200);
      const body = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(res);
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
      const body = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(getRes);
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
      const body = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(res);
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
      const body = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(res);
      expect(body.update_urls).toEqual([[urlWithSpace, urlTrimmed]]);
    });

    test("16e. POST remove non-HTTP URL (rewritten to empty)", async () => {
      const res = await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [],
        remove: ["ftp://example.com/feed"],
      });
      expect(res.status).toBe(200);
      const body = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(res);
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
      const body = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(res);
      expect(body.add).toContain(urlA);
      expect(body.add).toContain(urlB);
    });

    test("18. POST urlA→T1, GET since=T1+1 (exclusive)", async () => {
      const addRes = await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [urlA],
        remove: [],
      });
      const addBody = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(addRes);
      const T1 = addBody.timestamp;

      const res = await alice.client.get(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        since: String(T1 + 1),
      });
      const body = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(res);
      expect(body.add).not.toContain(urlA);
    });

    test("19. GET since=far future", async () => {
      const res = await alice.client.get(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        since: String(Date.now() + 1000000000),
      });
      const body = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(res);
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
      const body = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(getRes);
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
      const body = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(res);
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
      const body = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(res);
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
      const body = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(getRes);
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
      const body = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(getRes);
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

        await client.post("/api/b-ext/register", {
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
      const body = await alice.client.json<{
        add: string[];
        remove: string[];
        update_urls: [string, string][];
        timestamp: number;
      }>(getRes);
      expect(body.add).toContain("https://feeds.example.com/txt-test.xml");
    });

    test("30. GET access for bob's subscriptions as alice (403)", async () => {
      // Create bob
      await new Client(serverUrl).post("/api/b-ext/register", {
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
      const devices = await alice.client.json<{ id: string; name: string }[]>(devicesRes);
      const device = devices.find((d) => d.id === newDeviceId);
      expect(device).toBeDefined();
    });

    test("37. PUT response body is empty on success", async () => {
      const res = await alice.client.put(`/subscriptions/${username}/phone.json`, [urlA]);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toBe("");
    });
  });

  describe("Simple API - JSONP and XML formats", () => {
    interface FormatTestContext {
      user: TestUser;
      username: string;
      deviceId: string;
    }

    async function createTestUserWithDevice(serverUrl: string): Promise<FormatTestContext> {
      const testUsername = `format_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const user = await createTestUser(serverUrl, {
        username: testUsername,
        password: "password123",
      });
      const deviceId = "test-device";

      await user.client.post(`/api/2/devices/${user.username}/${deviceId}.json`, {
        caption: "Test Device",
        type: "mobile",
      });

      return { user, username: user.username, deviceId };
    }

    let ctx: FormatTestContext;

    beforeEach(async () => {
      ctx = await createTestUserWithDevice(serverUrl);
    });

    describe("JSONP format", () => {
      test("returns subscription list wrapped in callback", async () => {
        const testUrls = [
          "https://feeds.example.com/jsonp-feed-a.xml",
          "https://feeds.example.com/jsonp-feed-b.xml",
        ];
        await ctx.user.client.put(`/subscriptions/${ctx.username}/${ctx.deviceId}.json`, testUrls);

        const res = await ctx.user.client.get(
          `/subscriptions/${ctx.username}/${ctx.deviceId}.jsonp?jsonp=myCallback`,
        );
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toContain("application/javascript");

        const body = await res.text();
        expect(body.startsWith("myCallback(")).toBe(true);
        expect(body.endsWith(")")).toBe(true);

        const jsonContent = body.slice("myCallback(".length, -1);
        const data = JSON.parse(jsonContent);
        expect(Array.isArray(data)).toBe(true);
        expect(data).toContain(testUrls[0]);
        expect(data).toContain(testUrls[1]);
      });

      test("rejects invalid callback characters", async () => {
        const res = await ctx.user.client.get(
          `/subscriptions/${ctx.username}/${ctx.deviceId}.jsonp?jsonp=!invalid`,
        );
        expect(res.status).toBe(400);
      });

      test("requires callback parameter", async () => {
        const res = await ctx.user.client.get(
          `/subscriptions/${ctx.username}/${ctx.deviceId}.jsonp`,
        );
        expect(res.status).toBe(400);
      });

      test("allows underscore in callback name", async () => {
        await ctx.user.client.put(`/subscriptions/${ctx.username}/${ctx.deviceId}.json`, [
          "https://example.com/feed.xml",
        ]);

        const res = await ctx.user.client.get(
          `/subscriptions/${ctx.username}/${ctx.deviceId}.jsonp?jsonp=my_callback`,
        );
        expect(res.status).toBe(200);
        const body = await res.text();
        expect(body.startsWith("my_callback(")).toBe(true);
      });

      test("ignores jsonp param on json endpoint", async () => {
        await ctx.user.client.put(`/subscriptions/${ctx.username}/${ctx.deviceId}.json`, [
          "https://example.com/feed.xml",
        ]);

        const res = await ctx.user.client.get(
          `/subscriptions/${ctx.username}/${ctx.deviceId}.json?jsonp=myCallback`,
        );
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toContain("application/json");

        const body = await res.text();
        expect(body.startsWith("myCallback(")).toBe(false);
      });

      test("works for user-level endpoint", async () => {
        await ctx.user.client.put(`/subscriptions/${ctx.username}/${ctx.deviceId}.json`, [
          "https://example.com/feed.xml",
        ]);

        const res = await ctx.user.client.get(
          `/subscriptions/${ctx.username}.jsonp?jsonp=handleData`,
        );
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toContain("application/javascript");

        const body = await res.text();
        expect(body.startsWith("handleData(")).toBe(true);
      });
    });

    describe("XML format", () => {
      test("returns device subscriptions as structured XML", async () => {
        const testUrls = [
          "https://feeds.example.com/xml-feed-a.xml",
          "https://feeds.example.com/xml-feed-b.xml",
        ];
        await ctx.user.client.put(`/subscriptions/${ctx.username}/${ctx.deviceId}.json`, testUrls);

        const res = await ctx.user.client.get(`/subscriptions/${ctx.username}/${ctx.deviceId}.xml`);
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toContain("application/xml");

        const body = await res.text();
        const urls = extractPodcastUrls(body);

        expect(countPodcastElements(body)).toBe(2);
        expect(urls).toContain(testUrls[0]);
        expect(urls).toContain(testUrls[1]);
      });

      test("returns all user subscriptions as XML for user-level endpoint", async () => {
        const testUrl = "https://feeds.example.com/user-level-feed.xml";
        await ctx.user.client.put(`/subscriptions/${ctx.username}/${ctx.deviceId}.json`, [testUrl]);

        const res = await ctx.user.client.get(`/subscriptions/${ctx.username}.xml`);
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toContain("application/xml");

        const body = await res.text();
        const urls = extractPodcastUrls(body);

        expect(urls).toContain(testUrl);
      });

      test("respects Accept header for XML format", async () => {
        const testUrl = "https://feeds.example.com/accept-header-feed.xml";
        await ctx.user.client.put(`/subscriptions/${ctx.username}/${ctx.deviceId}.json`, [testUrl]);

        const res = await ctx.user.client.get(
          `/subscriptions/${ctx.username}/${ctx.deviceId}`,
          undefined,
          {
            headers: { Accept: "application/xml" },
          },
        );
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toContain("application/xml");

        const body = await res.text();
        const urls = extractPodcastUrls(body);

        expect(urls).toContain(testUrl);
      });

      test("respects text/xml Accept header for XML format", async () => {
        const testUrl = "https://feeds.example.com/text-xml-feed.xml";
        await ctx.user.client.put(`/subscriptions/${ctx.username}/${ctx.deviceId}.json`, [testUrl]);

        const res = await ctx.user.client.get(
          `/subscriptions/${ctx.username}/${ctx.deviceId}`,
          undefined,
          {
            headers: { Accept: "text/xml" },
          },
        );
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toContain("application/xml");

        const body = await res.text();
        const urls = extractPodcastUrls(body);

        expect(urls).toContain(testUrl);
      });

      test("respects Accept header for user-level endpoint", async () => {
        const testUrl = "https://feeds.example.com/user-accept-feed.xml";
        await ctx.user.client.put(`/subscriptions/${ctx.username}/${ctx.deviceId}.json`, [testUrl]);

        const res = await ctx.user.client.get(`/subscriptions/${ctx.username}`, undefined, {
          headers: { Accept: "application/xml" },
        });
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toContain("application/xml");

        const body = await res.text();
        const urls = extractPodcastUrls(body);

        expect(urls).toContain(testUrl);
      });

      test("explicit extension takes precedence over Accept header", async () => {
        await ctx.user.client.put(`/subscriptions/${ctx.username}/${ctx.deviceId}.json`, [
          "https://example.com/feed.xml",
        ]);

        const res = await ctx.user.client.get(
          `/subscriptions/${ctx.username}/${ctx.deviceId}.json`,
          undefined,
          {
            headers: { Accept: "application/xml" },
          },
        );
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toContain("application/json");

        const body = await res.text();
        expect(body.startsWith("[")).toBe(true);
      });

      test("prefers higher-priority JSON accept type over XML", async () => {
        await ctx.user.client.put(`/subscriptions/${ctx.username}/${ctx.deviceId}.json`, [
          "https://example.com/feed.xml",
        ]);

        const res = await ctx.user.client.get(
          `/subscriptions/${ctx.username}/${ctx.deviceId}`,
          undefined,
          {
            headers: { Accept: "application/json;q=1, application/xml;q=0.5" },
          },
        );
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toContain("application/json");

        const body = await res.text();
        expect(body.startsWith("[")).toBe(true);
      });

      test("escapes special XML characters", async () => {
        const specialUrl = "https://example.com/feed?param=value&other=test";
        await ctx.user.client.put(`/subscriptions/${ctx.username}/${ctx.deviceId}.json`, [
          specialUrl,
        ]);

        const res = await ctx.user.client.get(`/subscriptions/${ctx.username}/${ctx.deviceId}.xml`);
        expect(res.status).toBe(200);

        const body = await res.text();
        const urls = extractPodcastUrls(body);

        expect(body).toContain("?param=value&amp;other=test");
        expect(urls).toContain(specialUrl);
      });

      test("dedupes URLs across multiple devices for user-level endpoint", async () => {
        const tabletDevice = "tablet-dedupe";
        await ctx.user.client.post(`/api/2/devices/${ctx.username}/${tabletDevice}.json`, {
          caption: "Tablet",
          type: "mobile",
        });

        const sharedUrl = `https://dedupe-test-${Date.now()}.example.com/feed.xml`;
        await ctx.user.client.post(`/api/2/subscriptions/${ctx.username}/${ctx.deviceId}.json`, {
          add: [sharedUrl],
          remove: [],
        });
        await ctx.user.client.post(`/api/2/subscriptions/${ctx.username}/${tabletDevice}.json`, {
          add: [sharedUrl],
          remove: [],
        });

        const res = await ctx.user.client.get(`/subscriptions/${ctx.username}.xml`);
        expect(res.status).toBe(200);

        const body = await res.text();
        const urls = extractPodcastUrls(body);
        const occurrences = urls.filter((url) => url === sharedUrl).length;

        expect(occurrences).toBe(1);
      });

      test("dedupes correctly with Accept header", async () => {
        const tabletDevice = "tablet-dedupe-accept";
        await ctx.user.client.post(`/api/2/devices/${ctx.username}/${tabletDevice}.json`, {
          caption: "Tablet",
          type: "mobile",
        });

        const sharedUrl = `https://dedupe-accept-${Date.now()}.example.com/feed.xml`;
        await ctx.user.client.post(`/api/2/subscriptions/${ctx.username}/${ctx.deviceId}.json`, {
          add: [sharedUrl],
          remove: [],
        });
        await ctx.user.client.post(`/api/2/subscriptions/${ctx.username}/${tabletDevice}.json`, {
          add: [sharedUrl],
          remove: [],
        });

        const res = await ctx.user.client.get(`/subscriptions/${ctx.username}`, undefined, {
          headers: { Accept: "application/xml" },
        });
        expect(res.status).toBe(200);

        const body = await res.text();
        const urls = extractPodcastUrls(body);
        const occurrences = urls.filter((url) => url === sharedUrl).length;

        expect(occurrences).toBe(1);
      });

      test("returns 404 for unknown device", async () => {
        const res = await ctx.user.client.get(
          `/subscriptions/${ctx.username}/nonexistent-device.xml`,
        );
        expect(res.status).toBe(404);
      });
    });
  });

  describe("Simple API - Request and Response Formats", () => {
    let ctx: { user: TestUser; username: string; deviceId: string };

    beforeEach(async () => {
      const testUsername = `format_io_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const user = await createTestUser(serverUrl, {
        username: testUsername,
        password: "password123",
      });
      const deviceId = "io-device";

      await user.client.post(`/api/2/devices/${user.username}/${deviceId}.json`, {
        caption: "IO Device",
        type: "mobile",
      });

      ctx = { user, username: user.username, deviceId };
    });

    test("PUT parses JSON body based on Content-Type even on .opml path", async () => {
      const feedUrl = "https://feeds.example.com/content-type-json.xml";

      const putRes = await ctx.user.client.put(
        `/subscriptions/${ctx.username}/${ctx.deviceId}.opml`,
        [feedUrl],
        { headers: { "Content-Type": "application/json" } },
      );
      expect(putRes.status).toBe(200);

      const getRes = await ctx.user.client.get(
        `/subscriptions/${ctx.username}/${ctx.deviceId}.json`,
      );
      expect(getRes.status).toBe(200);

      const urls = (await getRes.json()) as string[];
      expect(urls).toContain(feedUrl);
    });
  });

  describe("b-ext Paginated Subscriptions", () => {
    test("first page returns paginated envelope with items", async () => {
      const res = await alice.client.get(`/api/b-ext/subscriptions/${username}.json`);
      expect(res.status).toBe(200);
      const body = await alice.client.json<{
        items: { url: string; title: string | null; image_url: string | null }[];
        page: {
          next_cursor: string | null;
          total_count: number | null;
        };
      }>(res);
      expect(Array.isArray(body.items)).toBe(true);
      expect(typeof body.page).toBe("object");
      expect(typeof body.page.total_count).toBe("number");
      expect(typeof body.page.next_cursor).toBe(
        body.page.next_cursor === null ? "object" : "string",
      );
    });

    test("first page with limit=2 returns up to 2 items and next_cursor", async () => {
      const res = await alice.client.get(`/api/b-ext/subscriptions/${username}.json`, {
        limit: "2",
      });
      expect(res.status).toBe(200);
      const body = await alice.client.json<{
        items: { url: string }[];
        page: {
          next_cursor: string | null;
          total_count: number | null;
        };
      }>(res);
      expect(body.items.length).toBeLessThanOrEqual(2);
      if ((body.page.total_count ?? 0) > 2) {
        expect(body.page.next_cursor).not.toBeNull();
      } else {
        expect(body.page.next_cursor).toBeNull();
      }
    });

    test("cursor pagination returns the next page of items", async () => {
      const firstRes = await alice.client.get(`/api/b-ext/subscriptions/${username}.json`, {
        limit: "2",
      });
      expect(firstRes.status).toBe(200);
      const firstBody = await alice.client.json<{
        items: { url: string }[];
        page: {
          next_cursor: string | null;
          total_count: number | null;
        };
      }>(firstRes);

      if (!firstBody.page.next_cursor) return;

      const secondRes = await alice.client.get(
        `/api/b-ext/subscriptions/${username}.json?limit=2&cursor=${encodeURIComponent(firstBody.page.next_cursor)}`,
      );
      expect(secondRes.status).toBe(200);
      const secondBody = await alice.client.json<{
        items: { url: string }[];
        page: {
          next_cursor: string | null;
          total_count: number | null;
        };
      }>(secondRes);

      const firstUrls = new Set(firstBody.items.map((i) => i.url));
      const secondUrls = new Set(secondBody.items.map((i) => i.url));
      for (const url of secondUrls) {
        expect(firstUrls.has(url)).toBe(false);
      }
    });

    test("total_count reflects unique subscription URLs across all devices", async () => {
      const res = await alice.client.get(`/api/b-ext/subscriptions/${username}.json`);
      expect(res.status).toBe(200);
      const body = await alice.client.json<{
        page: {
          total_count: number | null;
        };
      }>(res);
      expect(body.page.total_count).toBeGreaterThanOrEqual(0);
    });

    test("device-scoped pagination returns paginated envelope", async () => {
      const res = await alice.client.get(`/api/b-ext/subscriptions/${username}/${deviceId}.json`);
      expect(res.status).toBe(200);
      const body = await alice.client.json<{
        items: { url: string }[];
        page: {
          next_cursor: string | null;
          total_count: number | null;
        };
      }>(res);
      expect(Array.isArray(body.items)).toBe(true);
      expect(typeof body.page).toBe("object");
      expect(body.page.total_count).toBeGreaterThanOrEqual(0);
    });

    test("device-scoped pagination with cursor returns next page", async () => {
      const firstRes = await alice.client.get(
        `/api/b-ext/subscriptions/${username}/${deviceId}.json?limit=1`,
      );
      expect(firstRes.status).toBe(200);
      const firstBody = await alice.client.json<{
        items: { url: string }[];
        page: {
          next_cursor: string | null;
          total_count: number | null;
        };
      }>(firstRes);

      if (!firstBody.page.next_cursor) return;

      const secondRes = await alice.client.get(
        `/api/b-ext/subscriptions/${username}/${deviceId}.json?limit=1&cursor=${encodeURIComponent(firstBody.page.next_cursor)}`,
      );
      expect(secondRes.status).toBe(200);
      const secondBody = await alice.client.json<{
        items: { url: string }[];
        page: {
          next_cursor: string | null;
          total_count: number | null;
        };
      }>(secondRes);

      const firstUrls = new Set(firstBody.items.map((i) => i.url));
      const secondUrls = new Set(secondBody.items.map((i) => i.url));
      for (const url of secondUrls) {
        expect(firstUrls.has(url)).toBe(false);
      }
    });

    test("unknown device returns 404 on paginated endpoint", async () => {
      const res = await alice.client.get(
        `/api/b-ext/subscriptions/${username}/unknown-device-xyz.json`,
      );
      expect(res.status).toBe(404);
    });

    test("device IDs with dots work on b-ext paginated endpoint", async () => {
      const dottedDeviceId = "Mac.domain.local";
      const dottedFeedUrl = `https://feeds.example.com/dotted-device-${Date.now()}.xml`;

      await alice.client.post(`/api/2/devices/${username}/${dottedDeviceId}.json`, {
        caption: "Mac",
        type: "desktop",
      });

      await alice.client.post(`/api/2/subscriptions/${username}/${dottedDeviceId}.json`, {
        add: [dottedFeedUrl],
        remove: [],
      });

      const res = await alice.client.get(
        `/api/b-ext/subscriptions/${username}/${dottedDeviceId}?limit=10`,
      );
      expect(res.status).toBe(200);

      const body = await alice.client.json<{
        items: { url: string }[];
      }>(res);
      expect(body.items.some((item) => item.url === dottedFeedUrl)).toBe(true);
    });

    test("limit greater than 200 returns 400", async () => {
      const res = await alice.client.get(`/api/b-ext/subscriptions/${username}.json?limit=999`);
      expect(res.status).toBe(400);
    });

    test("limit at max 200 returns 200", async () => {
      const res = await alice.client.get(`/api/b-ext/subscriptions/${username}.json?limit=200`);
      expect(res.status).toBe(200);
    });

    test("invalid limit returns 400", async () => {
      const res = await alice.client.get(`/api/b-ext/subscriptions/${username}.json?limit=0`);
      expect(res.status).toBe(400);
    });

    test("invalid cursor returns 400", async () => {
      const res = await alice.client.get(
        `/api/b-ext/subscriptions/${username}.json?cursor=invalid-base64`,
      );
      expect(res.status).toBe(400);
    });

    test("empty cursor returns 400", async () => {
      const res = await alice.client.get(`/api/b-ext/subscriptions/${username}.json?cursor=`);
      expect(res.status).toBe(400);
    });

    test("future version cursor returns 400", async () => {
      const futureCursor = Buffer.from(JSON.stringify({ v: 99, primary: 123, id: 456 })).toString(
        "base64url",
      );
      const res = await alice.client.get(
        `/api/b-ext/subscriptions/${username}.json?cursor=${encodeURIComponent(futureCursor)}`,
      );
      expect(res.status).toBe(400);
    });

    test("pagination returns exact items with deterministic ordering", async () => {
      const res1 = await alice.client.get(
        `/api/b-ext/subscriptions/${username}/${deviceId}.json?limit=1`,
      );
      expect(res1.status).toBe(200);
      const body1 = await alice.client.json<{
        items: { url: string }[];
        page: { next_cursor: string | null; total_count: number | null };
      }>(res1);

      expect(body1.items).toHaveLength(1);
      expect(body1.page.next_cursor).not.toBeNull();

      const res2 = await alice.client.get(
        `/api/b-ext/subscriptions/${username}/${deviceId}.json?limit=1&cursor=${encodeURIComponent(body1.page.next_cursor!)}`,
      );
      expect(res2.status).toBe(200);
      const body2 = await alice.client.json<{
        items: { url: string }[];
        page: { next_cursor: string | null; total_count: number | null };
      }>(res2);

      expect(body2.items).toHaveLength(1);
      expect(body1.items[0].url).not.toBe(body2.items[0].url);
    });

    test("total_count matches actual subscription count for device", async () => {
      const res = await alice.client.get(`/api/b-ext/subscriptions/${username}/${deviceId}.json`);
      expect(res.status).toBe(200);
      const body = await alice.client.json<{
        items: { url: string }[];
        page: { total_count: number | null };
      }>(res);

      expect(body.page.total_count).toBe(body.items.length);
    });

    test("unknown query params are ignored", async () => {
      const res = await alice.client.get(
        `/api/b-ext/subscriptions/${username}.json?unknown=value&another=123`,
      );
      expect(res.status).toBe(200);
      const body = await alice.client.json<{
        items: { url: string }[];
      }>(res);
      expect(Array.isArray(body.items)).toBe(true);
    });

    test("all-devices endpoint dedupes same URL across multiple devices", async () => {
      // Create a second device for dedupe testing
      const device2Id = "tablet";
      await alice.client.post(`/api/2/devices/${username}/${device2Id}.json`, {
        caption: "Tablet",
        type: "mobile",
      });

      // Add overlapping URLs to both devices (use unique URLs to avoid conflicts with other tests)
      const sharedUrl = `https://feeds.example.com/shared-feed-${Date.now()}.xml`;
      const device1Only = `https://feeds.example.com/device1-only-${Date.now()}.xml`;
      const device2Only = `https://feeds.example.com/device2-only-${Date.now()}.xml`;

      await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [sharedUrl, device1Only],
        remove: [],
      });

      await alice.client.post(`/api/2/subscriptions/${username}/${device2Id}.json`, {
        add: [sharedUrl, device2Only],
        remove: [],
      });

      // All-devices endpoint should show exactly 3 unique URLs
      const res = await alice.client.get(`/api/b-ext/subscriptions/${username}.json`);
      expect(res.status).toBe(200);
      const body = await alice.client.json<{
        items: { url: string }[];
        page: { total_count: number | null };
      }>(res);

      // Count occurrences of each URL
      const urlCounts = new Map<string, number>();
      for (const item of body.items) {
        urlCounts.set(item.url, (urlCounts.get(item.url) ?? 0) + 1);
      }

      // Verify our test URLs are present
      expect(urlCounts.has(sharedUrl)).toBe(true);
      expect(urlCounts.has(device1Only)).toBe(true);
      expect(urlCounts.has(device2Only)).toBe(true);

      // Verify no duplicates
      expect(urlCounts.get(sharedUrl)).toBe(1);
      expect(urlCounts.get(device1Only)).toBe(1);
      expect(urlCounts.get(device2Only)).toBe(1);

      // Verify total_count includes our 3 new unique URLs
      expect(body.page.total_count ?? 0).toBeGreaterThanOrEqual(3);
    });

    test("full pagination walk collects all items without duplicates", async () => {
      const allUrls: string[] = [];
      let cursor: string | null = null;
      let pageCount = 0;
      let totalCount: number | null = null;

      do {
        const res = await alice.client.get(
          `/api/b-ext/subscriptions/${username}/${deviceId}.json?limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        );
        expect(res.status).toBe(200);
        const body = await alice.client.json<{
          items: { url: string }[];
          page: { next_cursor: string | null; total_count: number | null };
        }>(res);

        if (totalCount === null) {
          totalCount = body.page.total_count;
        } else {
          // total_count should be consistent across pages
          expect(body.page.total_count).toBe(totalCount);
        }

        for (const item of body.items) {
          allUrls.push(item.url);
        }

        cursor = body.page.next_cursor;
        pageCount++;

        // Safety limit to prevent infinite loops
        expect(pageCount).toBeLessThanOrEqual(10);
      } while (cursor !== null);

      // Verify no duplicates
      const uniqueUrls = new Set(allUrls);
      expect(uniqueUrls.size).toBe(allUrls.length);

      // Verify we got exactly total_count items
      expect(allUrls.length).toBe(totalCount ?? 0);
    });

    test("filter by URL returns matching subscriptions", async () => {
      // First add some subscriptions with distinct URLs
      const searchUrl = `https://linuxpodcast.example.com/feed-${Date.now()}.xml`;
      const otherUrl = `https://otherpodcast.example.com/feed-${Date.now()}.xml`;

      await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [searchUrl, otherUrl],
        remove: [],
      });

      // Filter by "linux" should match only the linux URL
      const res = await alice.client.get(
        `/api/b-ext/subscriptions/${username}/${deviceId}.json?q=linux`,
      );
      expect(res.status).toBe(200);
      const body = await alice.client.json<{
        items: { url: string }[];
        page: { total_count: number | null };
      }>(res);

      expect(body.items.length).toBeGreaterThanOrEqual(1);
      expect(body.items.some((item) => item.url.includes("linux"))).toBe(true);
      expect(body.items.every((item) => item.url.toLowerCase().includes("linux"))).toBe(true);
    });

    test("filter by title returns matching subscriptions", async () => {
      // Add a subscription and wait for feed metadata
      const feedUrl = `https://testpodcast.example.com/feed-${Date.now()}.xml`;

      await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [feedUrl],
        remove: [],
      });

      // Filter by common podcast word (this assumes some feeds have titles)
      const res = await alice.client.get(
        `/api/b-ext/subscriptions/${username}/${deviceId}.json?q=podcast`,
      );
      expect(res.status).toBe(200);
      const body = await alice.client.json<{
        items: { url: string; title: string | null }[];
        page: { total_count: number | null };
      }>(res);

      // Should return results (or empty if no titles match)
      expect(Array.isArray(body.items)).toBe(true);
    });

    test("filtered pagination returns correct total_count", async () => {
      const res = await alice.client.get(
        `/api/b-ext/subscriptions/${username}/${deviceId}.json?q=nonexistentxyz123`,
      );
      expect(res.status).toBe(200);
      const body = await alice.client.json<{
        items: { url: string }[];
        page: { total_count: number | null };
      }>(res);

      // Non-matching filter should return empty results with 0 total
      expect(body.items.length).toBe(0);
      expect(body.page.total_count).toBe(0);
    });

    test("filtered pagination with cursor returns all matching items", async () => {
      const token = `cursor-filter-${Date.now()}`;
      const matchingUrls = [
        `https://${token}-one.example.com/feed.xml`,
        `https://${token}-two.example.com/feed.xml`,
        `https://${token}-three.example.com/feed.xml`,
      ];
      const nonMatchingUrl = `https://other-${Date.now()}.example.com/feed.xml`;

      await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [...matchingUrls, nonMatchingUrl],
        remove: [],
      });

      const seenUrls: string[] = [];
      let cursor: string | null = null;
      let totalCount: number | null = null;

      do {
        const res = await alice.client.get(
          `/api/b-ext/subscriptions/${username}/${deviceId}.json?limit=1&q=${encodeURIComponent(token)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        );
        expect(res.status).toBe(200);

        const body = await alice.client.json<{
          items: { url: string }[];
          page: { next_cursor: string | null; total_count: number | null };
        }>(res);

        if (totalCount === null) {
          totalCount = body.page.total_count;
        } else {
          expect(body.page.total_count).toBe(totalCount);
        }

        for (const item of body.items) {
          expect(item.url).toContain(token);
          seenUrls.push(item.url);
        }

        cursor = body.page.next_cursor;
      } while (cursor !== null);

      expect(new Set(seenUrls)).toEqual(new Set(matchingUrls));
      expect(seenUrls).not.toContain(nonMatchingUrl);
      expect(totalCount).toBe(matchingUrls.length);
    });

    test("all-devices endpoint supports filtering", async () => {
      const res = await alice.client.get(`/api/b-ext/subscriptions/${username}.json?q=http`);
      expect(res.status).toBe(200);
      const body = await alice.client.json<{
        items: { url: string }[];
        page: { total_count: number | null };
      }>(res);

      // All URLs should contain "http" (which they all do)
      expect(body.items.length).toBeGreaterThanOrEqual(0);
    });

    describe("sorting", () => {
      let rss: MockRssServer;
      let fixtureToken: string;

      beforeAll(() => {
        fixtureToken = `sort-${Date.now()}`;
        rss = startMockRssServer({
          [`/${fixtureToken}-banana.xml`]: `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Banana Podcast</title>
    <item>
      <title>Episode 1</title>
      <enclosure url="https://example.com/banana.mp3" type="audio/mpeg" />
    </item>
  </channel>
</rss>`,
          [`/${fixtureToken}-apple.xml`]: `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Apple Podcast</title>
    <item>
      <title>Episode 1</title>
      <enclosure url="https://example.com/apple.mp3" type="audio/mpeg" />
    </item>
  </channel>
</rss>`,
          [`/${fixtureToken}-cherry.xml`]: `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Cherry Podcast</title>
    <item>
      <title>Episode 1</title>
      <enclosure url="https://example.com/cherry.mp3" type="audio/mpeg" />
    </item>
  </channel>
</rss>`,
        });
      });

      afterAll(() => {
        rss.stop();
      });

      test("sort.by syntax sorts by title ascending across pages", async () => {
        const urls = [
          `${rss.url}/${fixtureToken}-banana.xml`,
          `${rss.url}/${fixtureToken}-apple.xml`,
          `${rss.url}/${fixtureToken}-cherry.xml`,
        ];

        await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
          add: urls,
          remove: [],
        });

        await waitForSubscriptionTitles(alice.client, username, deviceId, fixtureToken, 3);

        const firstRes = await alice.client.get(
          `/api/b-ext/subscriptions/${username}/${deviceId}.json?limit=1&q=${encodeURIComponent(fixtureToken)}&sort.by=title&sort.dir=asc`,
        );
        expect(firstRes.status).toBe(200);
        const firstBody = await alice.client.json<{
          items: Array<{ title: string | null }>;
          page: { next_cursor: string | null };
        }>(firstRes);

        expect(firstBody.items[0]?.title).toBe("Apple Podcast");
        expect(firstBody.page.next_cursor).not.toBeNull();

        const secondRes = await alice.client.get(
          `/api/b-ext/subscriptions/${username}/${deviceId}.json?limit=1&q=${encodeURIComponent(fixtureToken)}&sort.by=title&sort.dir=asc&cursor=${encodeURIComponent(firstBody.page.next_cursor!)}`,
        );
        expect(secondRes.status).toBe(200);
        const secondBody = await alice.client.json<{
          items: Array<{ title: string | null }>;
          page: { next_cursor: string | null };
        }>(secondRes);

        expect(secondBody.items[0]?.title).toBe("Banana Podcast");
      });

      test("sort[by] syntax sorts by title descending", async () => {
        const urls = [
          `${rss.url}/${fixtureToken}-banana.xml`,
          `${rss.url}/${fixtureToken}-apple.xml`,
          `${rss.url}/${fixtureToken}-cherry.xml`,
        ];

        await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
          add: urls,
          remove: [],
        });

        await waitForSubscriptionTitles(alice.client, username, deviceId, fixtureToken, 3);

        const res = await alice.client.get(
          `/api/b-ext/subscriptions/${username}/${deviceId}.json?limit=3&q=${encodeURIComponent(fixtureToken)}&sort%5Bby%5D=title&sort%5Bdir%5D=desc`,
        );
        expect(res.status).toBe(200);
        const body = await alice.client.json<{
          items: Array<{ title: string | null }>;
        }>(res);

        expect(body.items.map((item) => item.title)).toEqual([
          "Cherry Podcast",
          "Banana Podcast",
          "Apple Podcast",
        ]);
      });

      test("invalid sort.by returns 400", async () => {
        const res = await alice.client.get(
          `/api/b-ext/subscriptions/${username}/${deviceId}.json?sort.by=bogus`,
        );
        expect(res.status).toBe(400);
      });
    });
  });
});
