import { describe, test, expect, beforeAll } from "bun:test";

import { getServerUrl } from "./helpers/server";
import { createTestUser, type TestUser } from "./helpers/setup";

// Test-only utility for parsing OPML responses (NOT imported from src/)
function extractFeedUrls(opmlXml: string): string[] {
  const urls: string[] = [];
  const regex = /xmlUrl=["']([^"']+)["']/gi;
  let match;
  while ((match = regex.exec(opmlXml)) !== null) {
    urls.push(match[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
  }
  return urls;
}

describe("opml", () => {
  let serverUrl: string;
  let alice: TestUser;
  let username: string;

  beforeAll(async () => {
    serverUrl = getServerUrl();
    username = `alice_opml_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    alice = await createTestUser(serverUrl, {
      username,
      password: "password123",
    });
  });

  test("1. OPML export with no subscriptions", async () => {
    const res = await alice.client.get(`/subscriptions/${username}.opml`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/x-opml");

    const body = await alice.client.text(res);
    expect(body).toContain("<?xml");
    expect(body).toContain("<opml");
    expect(body).toContain("<body>");
    expect(body).toContain("</body>");
    expect(body).toContain("</opml>");
    expect(body).not.toContain("<outline");
  });

  test("2. OPML export after subscribing to feeds", async () => {
    // Subscribe to two feeds
    const addRes = await alice.client.post(`/api/2/subscriptions/${username}/default.json`, {
      add: ["https://feed1.example.com/rss", "https://feed2.example.com/rss"],
      remove: [],
    });
    expect(addRes.status).toBe(200);

    // Get OPML export
    const res = await alice.client.get(`/subscriptions/${username}.opml`);
    expect(res.status).toBe(200);

    const body = await alice.client.text(res);
    expect(body).toContain('<outline type="rss"');
    expect(body).toContain('xmlUrl="https://feed1.example.com/rss"');
    expect(body).toContain('xmlUrl="https://feed2.example.com/rss"');
  });

  test("3. OPML export XML-escapes special characters in URLs", async () => {
    // Subscribe to a feed with & in URL
    await alice.client.post(`/api/2/subscriptions/${username}/default.json`, {
      add: ["https://example.com/feed?a=1&b=2"],
      remove: [],
    });

    const res = await alice.client.get(`/subscriptions/${username}.opml`);
    const body = await alice.client.text(res);

    // URL should be XML-escaped in the attribute (with &amp;)
    expect(body).toContain('xmlUrl="https://example.com/feed?a=1&amp;b=2"');
    // Raw unescaped & in query string should not appear
    expect(body).not.toContain("?a=1&b=2");
  });

  test("4. OPML Content-Type header is text/x-opml", async () => {
    const res = await alice.client.get(`/subscriptions/${username}.opml`);
    const contentType = res.headers.get("Content-Type");
    expect(contentType).toContain("text/x-opml");
    expect(contentType).not.toBe("text/xml");
  });

  test("5. Round-trip: subscribe → export OPML → verify URLs match", async () => {
    const expectedUrls = [
      "https://feeds.example.com/roundtrip1.xml",
      "https://feeds.example.com/roundtrip2.xml",
      "https://feeds.example.com/roundtrip3.xml",
    ];

    // Subscribe to 3 feeds
    await alice.client.post(`/api/2/subscriptions/${username}/default.json`, {
      add: expectedUrls,
      remove: [],
    });

    // Get OPML
    const res = await alice.client.get(`/subscriptions/${username}.opml`);
    const body = await alice.client.text(res);

    // Parse and verify URLs
    const extractedUrls = extractFeedUrls(body);
    for (const url of expectedUrls) {
      expect(extractedUrls).toContain(url);
    }
  });

  test("6. OPML export after removing a subscription", async () => {
    const feedA = "https://feeds.example.com/removal-test-a.xml";
    const feedB = "https://feeds.example.com/removal-test-b.xml";

    // Subscribe to both
    await alice.client.post(`/api/2/subscriptions/${username}/default.json`, {
      add: [feedA, feedB],
      remove: [],
    });

    // Remove feed B
    await alice.client.post(`/api/2/subscriptions/${username}/default.json`, {
      add: [],
      remove: [feedB],
    });

    // Get OPML
    const res = await alice.client.get(`/subscriptions/${username}.opml`);
    const body = await alice.client.text(res);

    // Feed A should be present, feed B should not
    const extractedUrls = extractFeedUrls(body);
    expect(extractedUrls).toContain(feedA);
    expect(extractedUrls).not.toContain(feedB);
  });

  test("7. OPML includes text attribute (OPML spec requirement)", async () => {
    // Subscribe to a feed
    await alice.client.post(`/api/2/subscriptions/${username}/default.json`, {
      add: ["https://feeds.example.com/text-attr-test.xml"],
      remove: [],
    });

    const res = await alice.client.get(`/subscriptions/${username}.opml`);
    const body = await alice.client.text(res);

    // Both title and text attributes should be present
    expect(body).toMatch(/title="[^"]+"/);
    expect(body).toMatch(/text="[^"]+"/);
  });

  test("8. Per-device OPML export", async () => {
    const deviceFeed = "https://feeds.example.com/device-specific.xml";

    // Subscribe on device "phone"
    await alice.client.post(`/api/2/subscriptions/${username}/phone.json`, {
      add: [deviceFeed],
      remove: [],
    });

    // Get OPML for device "phone"
    const res = await alice.client.get(`/subscriptions/${username}/phone.opml`);
    expect(res.status).toBe(200);

    const body = await alice.client.text(res);
    const extractedUrls = extractFeedUrls(body);
    expect(extractedUrls).toContain(deviceFeed);
  });
});
