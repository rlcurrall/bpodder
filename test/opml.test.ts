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

  test("9. OPML upload - basic import", async () => {
    const opmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
  <head><title>Test Feeds</title></head>
  <body>
    <outline type="rss" xmlUrl="https://upload1.example.com/feed.xml" title="Feed 1" />
    <outline type="rss" xmlUrl="https://upload2.example.com/feed.xml" title="Feed 2" />
  </body>
</opml>`;

    const res = await alice.client.put(`/subscriptions/${username}/opml-device.opml`, opmlContent, {
      headers: { "Content-Type": "text/xml" },
    });
    expect(res.status).toBe(200);

    // Verify feeds were added
    const getRes = await alice.client.get(`/api/2/subscriptions/${username}/opml-device.json`, {
      since: "0",
    });
    const body = await alice.client.json(getRes);
    expect(body.add).toContain("https://upload1.example.com/feed.xml");
    expect(body.add).toContain("https://upload2.example.com/feed.xml");
  });

  test("10. OPML upload - XML entities decoded", async () => {
    const opmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
  <body>
    <outline type="rss" xmlUrl="https://example.com/feed?a=1&amp;b=2&quot;test&quot;" title="Feed" />
  </body>
</opml>`;

    const res = await alice.client.put(
      `/subscriptions/${username}/opml-entities.opml`,
      opmlContent,
      { headers: { "Content-Type": "text/xml" } },
    );
    expect(res.status).toBe(200);

    // Verify URL was decoded (entities should be decoded)
    const getRes = await alice.client.get(`/api/2/subscriptions/${username}/opml-entities.json`, {
      since: "0",
    });
    const body = await alice.client.json(getRes);
    expect(body.add).toContain('https://example.com/feed?a=1&b=2"test"');
  });

  test("11. OPML upload - non-HTTP URLs filtered", async () => {
    const opmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
  <body>
    <outline type="rss" xmlUrl="https://valid.example.com/feed.xml" title="Valid" />
    <outline type="rss" xmlUrl="ftp://invalid.example.com/feed.xml" title="Invalid FTP" />
    <outline type="rss" xmlUrl="javascript://alert(1)" title="Invalid JS" />
  </body>
</opml>`;

    const res = await alice.client.put(
      `/subscriptions/${username}/opml-filtered.opml`,
      opmlContent,
      { headers: { "Content-Type": "text/xml" } },
    );
    expect(res.status).toBe(200);

    // Verify only HTTP URL was added
    const getRes = await alice.client.get(`/api/2/subscriptions/${username}/opml-filtered.json`, {
      since: "0",
    });
    const body = await alice.client.json(getRes);
    expect(body.add).toContain("https://valid.example.com/feed.xml");
    expect(body.add).not.toContain("ftp://invalid.example.com/feed.xml");
    expect(body.add).not.toContain("javascript://alert(1)");
  });

  test("12. OPML upload - duplicates ignored", async () => {
    const opmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
  <body>
    <outline type="rss" xmlUrl="https://dup.example.com/feed.xml" title="Feed 1" />
    <outline type="rss" xmlUrl="https://dup.example.com/feed.xml" title="Feed 2" />
    <outline type="rss" xmlUrl="https://dup.example.com/feed.xml" title="Feed 3" />
  </body>
</opml>`;

    const res = await alice.client.put(`/subscriptions/${username}/opml-dup.opml`, opmlContent, {
      headers: { "Content-Type": "text/xml" },
    });
    expect(res.status).toBe(200);

    // Verify only one instance was added
    const getRes = await alice.client.get(`/api/2/subscriptions/${username}/opml-dup.json`, {
      since: "0",
    });
    const body = await alice.client.json(getRes);
    const dupCount = body.add.filter(
      (u: string) => u === "https://dup.example.com/feed.xml",
    ).length;
    expect(dupCount).toBe(1);
  });
});
