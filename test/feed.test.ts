import { describe, test, expect, beforeAll, afterAll } from "bun:test";

import { startMockRssServer, type MockRssServer } from "./helpers/mock-rss";
import { getServerUrl } from "./helpers/server";
import { createTestUser, type TestUser } from "./helpers/setup";

describe("feed", () => {
  let serverUrl: string;
  let alice: TestUser;
  let rss: MockRssServer;

  beforeAll(async () => {
    serverUrl = getServerUrl();
    alice = await createTestUser(serverUrl, {
      username: "alice_feed",
      password: "password123",
    });

    // Start mock RSS server with test fixtures
    rss = startMockRssServer({
      "/podcast1.xml": `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test Podcast</title>
    <description>A test podcast feed</description>
    <item>
      <title>Episode 1</title>
      <enclosure url="https://example.com/ep1.mp3" type="audio/mpeg" />
      <itunes:duration>01:23:45</itunes:duration>
    </item>
  </channel>
</rss>`,
      "/404-feed.xml": { body: "Not Found", status: 404 },
      "/html-page.xml": {
        body: "<html>Not RSS</html>",
        contentType: "text/html",
      },
      "/slow-feed.xml": { body: "<rss></rss>", delay: 15000 },
      "/media-content.xml": `<?xml version="1.0"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Media Content Feed</title>
    <item>
      <title>Media Episode</title>
      <media:content url="https://example.com/media.mp3" type="audio/mpeg" />
    </item>
  </channel>
</rss>`,
      "/both-enclosure-media.xml": `<?xml version="1.0"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Both Formats</title>
    <item>
      <title>Dual Episode</title>
      <enclosure url="https://example.com/enclosure.mp3" type="audio/mpeg" />
      <media:content url="https://example.com/media.mp3" type="audio/mpeg" />
    </item>
  </channel>
</rss>`,
      "/durations.xml": `<?xml version="1.0"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Duration Test</title>
    <item>
      <title>Long Episode</title>
      <enclosure url="https://example.com/long.mp3" type="audio/mpeg" />
      <itunes:duration>01:23:45</itunes:duration>
    </item>
    <item>
      <title>Short Episode</title>
      <enclosure url="https://example.com/short.mp3" type="audio/mpeg" />
      <itunes:duration>15</itunes:duration>
    </item>
    <item>
      <title>Seconds Episode</title>
      <enclosure url="https://example.com/seconds.mp3" type="audio/mpeg" />
      <itunes:duration>300</itunes:duration>
    </item>
  </channel>
</rss>`,
      "/cdata.xml": `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title><![CDATA[CDATA Title & "Special"]]></title>
    <item>
      <title><![CDATA[Episode with <HTML> in title]]></title>
      <enclosure url="https://example.com/cdata.mp3" type="audio/mpeg" />
    </item>
  </channel>
</rss>`,
    });
  });

  afterAll(() => {
    rss.stop();
  });

  describe("RSS feed subscription and parsing", () => {
    test("1. Subscribe to valid RSS 2.0 feed", async () => {
      const feedUrl = `${rss.url}/podcast1.xml`;

      // Add subscription via API
      const res = await alice.client.post(`/api/2/subscriptions/alice_feed/phone.json`, {
        add: [feedUrl],
        remove: [],
      });
      expect(res.status).toBe(200);

      // Verify subscription was added
      const getRes = await alice.client.get(`/api/2/subscriptions/alice_feed/phone.json`, {
        since: "0",
      });
      const body = await alice.client.json<{ add: string[] }>(getRes);
      expect(body.add).toContain(feedUrl);
    });

    test("2. Subscribe to 404 feed — subscription accepted", async () => {
      const feedUrl = `${rss.url}/404-feed.xml`;

      const res = await alice.client.post(`/api/2/subscriptions/alice_feed/phone.json`, {
        add: [feedUrl],
        remove: [],
      });

      // Subscription is accepted even if feed is unreachable
      // Feed fetching is decoupled from subscription creation (per SPEC)
      expect(res.status).toBe(200);

      // Verify URL is in subscriptions
      const getRes = await alice.client.get(`/api/2/subscriptions/alice_feed/phone.json`, {
        since: "0",
      });
      const body = await alice.client.json<{ add: string[] }>(getRes);
      expect(body.add).toContain(feedUrl);
    });

    test("3. Subscribe to HTML page — subscription accepted", async () => {
      const feedUrl = `${rss.url}/html-page.xml`;

      const res = await alice.client.post(`/api/2/subscriptions/alice_feed/phone.json`, {
        add: [feedUrl],
        remove: [],
      });

      // Subscription is accepted even if URL returns HTML
      // Feed validation happens later during sync, not during subscribe
      expect(res.status).toBe(200);

      // Verify URL is in subscriptions
      const getRes = await alice.client.get(`/api/2/subscriptions/alice_feed/phone.json`, {
        since: "0",
      });
      const body = await alice.client.json<{ add: string[] }>(getRes);
      expect(body.add).toContain(feedUrl);
    });

    test("4. Subscribe to multiple feeds in one request", async () => {
      const feeds = [
        `${rss.url}/podcast1.xml`,
        `${rss.url}/media-content.xml`,
        `${rss.url}/durations.xml`,
      ];

      const res = await alice.client.post(`/api/2/subscriptions/alice_feed/phone.json`, {
        add: feeds,
        remove: [],
      });
      expect(res.status).toBe(200);

      // Verify all feeds are in subscriptions
      const getRes = await alice.client.get(`/api/2/subscriptions/alice_feed/phone.json`, {
        since: "0",
      });
      const body = await alice.client.json<{ add: string[] }>(getRes);
      for (const feed of feeds) {
        expect(body.add).toContain(feed);
      }
    });

    test("5. Subscribe to slow feed — accepted without blocking", async () => {
      const feedUrl = `${rss.url}/slow-feed.xml`;

      // Create a new user to avoid subscription conflicts
      const slowTestUser = await createTestUser(serverUrl, {
        username: `alice_slow_${Date.now()}`,
        password: "password123",
      });

      // Subscription creation should not block on feed fetch
      const startTime = Date.now();
      const res = await slowTestUser.client.post(
        `/api/2/subscriptions/${slowTestUser.username}/phone.json`,
        {
          add: [feedUrl],
          remove: [],
        },
      );
      const elapsed = Date.now() - startTime;

      // Should return quickly (not wait for the 15s delay)
      expect(res.status).toBe(200);
      expect(elapsed).toBeLessThan(5000); // Should complete in under 5 seconds
    });
  });

  describe("Feed metadata extraction", () => {
    test("6. OPML export contains subscribed feed URLs", async () => {
      // Create a fresh user for this test
      const opmlUser = await createTestUser(serverUrl, {
        username: `alice_opml_${Date.now()}`,
        password: "password123",
      });

      const feedUrl = `${rss.url}/podcast1.xml`;
      await opmlUser.client.post(`/api/2/subscriptions/${opmlUser.username}/phone.json`, {
        add: [feedUrl],
        remove: [],
      });

      // Get OPML export
      const res = await opmlUser.client.get(`/subscriptions/${opmlUser.username}.opml`);
      expect(res.status).toBe(200);

      const body = await opmlUser.client.text(res);
      expect(body).toContain("<?xml");
      expect(body).toContain("<opml");
      // Feed URL should appear XML-escaped in OPML
      expect(body).toContain(feedUrl.replace(/&/g, "&amp;"));
    });

    test("7. OPML with CDATA in feed title is handled", async () => {
      // Create a fresh user for this test
      const cdataUser = await createTestUser(serverUrl, {
        username: `alice_cdata_${Date.now()}`,
        password: "password123",
      });

      const feedUrl = `${rss.url}/cdata.xml`;
      await cdataUser.client.post(`/api/2/subscriptions/${cdataUser.username}/phone.json`, {
        add: [feedUrl],
        remove: [],
      });

      // Get OPML - should handle CDATA content without crashing
      const res = await cdataUser.client.get(`/subscriptions/${cdataUser.username}.opml`);
      expect(res.status).toBe(200);

      const body = await cdataUser.client.text(res);
      expect(body).toContain("<?xml");
      expect(body).toContain("<opml");
      // URL should be present in OPML
      expect(body).toContain(feedUrl.replace(/&/g, "&amp;"));
    });
  });

  describe("Feed content variations", () => {
    test("8. Feed with media:content is accepted", async () => {
      const feedUrl = `${rss.url}/media-content.xml`;

      const res = await alice.client.post(`/api/2/subscriptions/alice_feed/phone.json`, {
        add: [feedUrl],
        remove: [],
      });
      expect(res.status).toBe(200);

      // Verify subscription
      const getRes = await alice.client.get(`/api/2/subscriptions/alice_feed/phone.json`, {
        since: "0",
      });
      const body = await alice.client.json<{ add: string[] }>(getRes);
      expect(body.add).toContain(feedUrl);
    });

    test("9. Feed with both enclosure and media:content is accepted", async () => {
      const feedUrl = `${rss.url}/both-enclosure-media.xml`;

      const res = await alice.client.post(`/api/2/subscriptions/alice_feed/phone.json`, {
        add: [feedUrl],
        remove: [],
      });
      expect(res.status).toBe(200);

      // Verify subscription
      const getRes = await alice.client.get(`/api/2/subscriptions/alice_feed/phone.json`, {
        since: "0",
      });
      const body = await alice.client.json<{ add: string[] }>(getRes);
      expect(body.add).toContain(feedUrl);
    });
  });
});
