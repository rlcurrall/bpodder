import { describe, test, expect, beforeAll } from "bun:test";
import { getServerUrl } from "./helpers/server";
import { createTestUser, type TestUser } from "./helpers/setup";
import { Client } from "./helpers/client";

const feedUrl = "https://feeds.example.com/testfeed.xml";
const episodeUrl = "http://example.com/files/s01e20.mp3";
const podcastUrl = "http://example.com/feed.rss";

describe("episodes", () => {
  let serverUrl: string;
  let alice: TestUser;
  let username: string;
  const deviceId = "phone";

  beforeAll(async () => {
    serverUrl = getServerUrl();
    username = `alice_ep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    alice = await createTestUser(serverUrl, { username, password: "password123" });
    // Create device
    await alice.client.post(`/api/2/devices/${username}/${deviceId}.json`, {
      caption: "Phone",
      type: "mobile",
    });
    // Add subscription
    await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
      add: [podcastUrl],
      remove: [],
    });
  });

  describe("Basic recording", () => {
    test("1. GET since=0, no actions", async () => {
      const res = await alice.client.get(`/api/2/episodes/${username}.json`, { since: "0" });
      expect(res.status).toBe(200);
      const body = await alice.client.json(res);
      expect(body.actions).toEqual([]);
      expect(body.update_urls).toEqual([]);
      expect(typeof body.timestamp).toBe("number");
    });

    test("2. POST one download action", async () => {
      const res = await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: podcastUrl,
          episode: episodeUrl,
          action: "download",
          device: deviceId,
        },
      ]);
      expect(res.status).toBe(200);
      const body = await alice.client.json(res);
      expect(typeof body.timestamp).toBe("number");
    });

    test("3. GET since=0 — all fields present", async () => {
      const res = await alice.client.get(`/api/2/episodes/${username}.json`, { since: "0" });
      const body = await alice.client.json(res);
      expect(body.actions).toHaveLength(1);
      expect(body.actions[0]).toMatchObject({
        podcast: podcastUrl,
        episode: episodeUrl,
        action: "download",
      });
      expect(body.actions[0].timestamp).toBeDefined();
    });

    test("4. GET since=T1 — inclusive", async () => {
      // Get the timestamp from previous action
      const getRes = await alice.client.get(`/api/2/episodes/${username}.json`, { since: "0" });
      const getBody = await alice.client.json(getRes);
      const T1 = getBody.timestamp;

      // Query since T1
      const res = await alice.client.get(`/api/2/episodes/${username}.json`, { since: String(T1) });
      const body = await alice.client.json(res);
      expect(body.actions).toHaveLength(1);
    });

    test("5. POST new action", async () => {
      const res = await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: podcastUrl,
          episode: "http://example.com/ep-new.mp3",
          action: "new",
          device: deviceId,
        },
      ]);
      expect(res.status).toBe(200);

      const getRes = await alice.client.get(`/api/2/episodes/${username}.json`, { since: "0" });
      const body = await alice.client.json(getRes);
      expect(body.actions.some((a: any) => a.action === "new")).toBe(true);
    });

    test("6. POST play action with position, started, total", async () => {
      const res = await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: podcastUrl,
          episode: "http://example.com/ep-play.mp3",
          action: "play",
          device: deviceId,
          position: 120,
          started: 15,
          total: 500,
        },
      ]);
      expect(res.status).toBe(200);

      const getRes = await alice.client.get(`/api/2/episodes/${username}.json`, { since: "0" });
      const body = await alice.client.json(getRes);
      const playAction = body.actions.find((a: any) => a.episode === "http://example.com/ep-play.mp3");
      expect(playAction).toMatchObject({
        position: 120,
        started: 15,
        total: 500,
      });
    });

    test("7. POST delete action", async () => {
      const res = await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: podcastUrl,
          episode: "http://example.com/ep-delete.mp3",
          action: "delete",
          device: deviceId,
        },
      ]);
      expect(res.status).toBe(200);

      const getRes = await alice.client.get(`/api/2/episodes/${username}.json`, { since: "0" });
      const body = await alice.client.json(getRes);
      expect(body.actions.some((a: any) => a.action === "delete")).toBe(true);
    });

    test("8. POST action with explicit ISO 8601 timestamp", async () => {
      const explicitTimestamp = "2024-01-15T10:30:00Z";
      const res = await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: podcastUrl,
          episode: "http://example.com/ep-timestamp.mp3",
          action: "download",
          device: deviceId,
          timestamp: explicitTimestamp,
        },
      ]);
      expect(res.status).toBe(200);

      const getRes = await alice.client.get(`/api/2/episodes/${username}.json`, { since: "0" });
      const body = await alice.client.json(getRes);
      const action = body.actions.find((a: any) => a.episode === "http://example.com/ep-timestamp.mp3");
      expect(action.timestamp).toBe(explicitTimestamp);
    });

    test("9. POST action without timestamp (server assigns)", async () => {
      const res = await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: podcastUrl,
          episode: "http://example.com/ep-no-timestamp.mp3",
          action: "download",
          device: deviceId,
        },
      ]);
      expect(res.status).toBe(200);

      const getRes = await alice.client.get(`/api/2/episodes/${username}.json`, { since: "0" });
      const body = await alice.client.json(getRes);
      const action = body.actions.find((a: any) => a.episode === "http://example.com/ep-no-timestamp.mp3");
      expect(action.timestamp).toBeDefined();
      expect(action.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}/);
    });

    test("10. POST action with extra unknown fields", async () => {
      const res = await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: podcastUrl,
          episode: "http://example.com/ep-extra.mp3",
          action: "download",
          device: deviceId,
          customField: "customValue",
          anotherField: 123,
        },
      ]);
      expect(res.status).toBe(200);

      const getRes = await alice.client.get(`/api/2/episodes/${username}.json`, { since: "0" });
      const body = await alice.client.json(getRes);
      const action = body.actions.find((a: any) => a.episode === "http://example.com/ep-extra.mp3");
      expect(action.customField).toBe("customValue");
      expect(action.anotherField).toBe(123);
    });

    test("11. POST action with device field", async () => {
      const res = await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: podcastUrl,
          episode: "http://example.com/ep-device.mp3",
          action: "download",
          device: deviceId,
        },
      ]);
      expect(res.status).toBe(200);

      const getRes = await alice.client.get(`/api/2/episodes/${username}.json`, { since: "0" });
      const body = await alice.client.json(getRes);
      const action = body.actions.find((a: any) => a.episode === "http://example.com/ep-device.mp3");
      expect(action.device).toBe(deviceId);
    });

    test("12. POST action with mixed-case action (Play → play)", async () => {
      const res = await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: podcastUrl,
          episode: "http://example.com/ep-play-case.mp3",
          action: "Play",
          device: deviceId,
          position: 60,
        },
      ]);
      expect(res.status).toBe(200);

      const getRes = await alice.client.get(`/api/2/episodes/${username}.json`, { since: "0" });
      const body = await alice.client.json(getRes);
      const action = body.actions.find((a: any) => a.episode === "http://example.com/ep-play-case.mp3");
      expect(action.action).toBe("play"); // lowercased
    });

    test("13. POST empty array", async () => {
      const res = await alice.client.post(`/api/2/episodes/${username}.json`, []);
      expect(res.status).toBe(200);
    });

    test("14. POST non-array body", async () => {
      const res = await alice.client.post(`/api/2/episodes/${username}.json`, { not: "array" });
      expect(res.status).toBe(400);
    });

    test("15. POST action missing podcast", async () => {
      const res = await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          episode: "http://example.com/ep-no-podcast.mp3",
          action: "download",
        },
      ]);
      expect(res.status).toBe(400);
    });

    test("16. POST action missing episode", async () => {
      const res = await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: podcastUrl,
          action: "download",
        },
      ]);
      expect(res.status).toBe(400);
    });

    test("17. POST action with invalid action type", async () => {
      const res = await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: podcastUrl,
          episode: "http://example.com/ep-invalid.mp3",
          action: "watch",
        },
      ]);
      expect(res.status).toBe(400);
    });

    test("17b. POST flattr action (valid action type)", async () => {
      const res = await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: podcastUrl,
          episode: "http://example.com/ep-flattr.mp3",
          action: "flattr",
          device: deviceId,
        },
      ]);
      expect(res.status).toBe(200);

      const getRes = await alice.client.get(`/api/2/episodes/${username}.json`, { since: "0" });
      const body = await alice.client.json(getRes);
      const action = body.actions.find((a: any) => a.episode === "http://example.com/ep-flattr.mp3");
      expect(action).toBeDefined();
      expect(action.action).toBe("flattr");
    });

    test("17c. POST action with guid field (preserved)", async () => {
      const guid = "urn:episode:abc123";
      const res = await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: podcastUrl,
          episode: "http://example.com/ep-guid.mp3",
          action: "download",
          device: deviceId,
          guid: guid,
        },
      ]);
      expect(res.status).toBe(200);

      const getRes = await alice.client.get(`/api/2/episodes/${username}.json`, { since: "0" });
      const body = await alice.client.json(getRes);
      const action = body.actions.find((a: any) => a.episode === "http://example.com/ep-guid.mp3");
      expect(action).toBeDefined();
      expect(action.guid).toBe(guid);
    });

    test("17e. POST action with whitespace in URLs (tracked in update_urls)", async () => {
      const podcastWithSpace = " http://example.com/spaced-feed.rss";
      const podcastTrimmed = "http://example.com/spaced-feed.rss";
      const episodeWithSpace = " http://example.com/spaced-episode.mp3";
      const episodeTrimmed = "http://example.com/spaced-episode.mp3";

      const res = await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: podcastWithSpace,
          episode: episodeWithSpace,
          action: "download",
          device: deviceId,
        },
      ]);
      expect(res.status).toBe(200);
      const body = await alice.client.json(res);
      
      // update_urls should contain both podcast and episode URL rewrites as tuples
      expect(body.update_urls).toEqual([
        [podcastWithSpace, podcastTrimmed],
        [episodeWithSpace, episodeTrimmed],
      ]);
    });
  });

  describe("since filtering", () => {
    test("18. POST action → T1, GET since=T1 (inclusive)", async () => {
      const postRes = await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: podcastUrl,
          episode: "http://example.com/ep-since-test.mp3",
          action: "download",
        },
      ]);
      const postBody = await alice.client.json(postRes);
      const T1 = postBody.timestamp;

      const res = await alice.client.get(`/api/2/episodes/${username}.json`, { since: String(T1) });
      const body = await alice.client.json(res);
      expect(body.actions.some((a: any) => a.episode === "http://example.com/ep-since-test.mp3")).toBe(true);
    });

    test("19. POST action → T1, GET since=T1+1 (not included)", async () => {
      const postRes = await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: podcastUrl,
          episode: "http://example.com/ep-since-exclusive.mp3",
          action: "download",
        },
      ]);
      const postBody = await alice.client.json(postRes);
      const T1 = postBody.timestamp;

      const res = await alice.client.get(`/api/2/episodes/${username}.json`, { since: String(T1 + 1) });
      const body = await alice.client.json(res);
      expect(body.actions.some((a: any) => a.episode === "http://example.com/ep-since-exclusive.mp3")).toBe(false);
    });

    test("20. GET since=far future", async () => {
      const res = await alice.client.get(`/api/2/episodes/${username}.json`, {
        since: String(Date.now() + 1000000000),
      });
      const body = await alice.client.json(res);
      expect(body.actions).toEqual([]);
    });

    test("21. GET since=abc (coerced to 0)", async () => {
      const res = await alice.client.get(`/api/2/episodes/${username}.json`, { since: "abc" });
      expect(res.status).toBe(200);
      // Should return all results
      const body = await alice.client.json(res);
      expect(body.actions.length).toBeGreaterThan(0);
    });
  });

  describe("Auto-subscription on unknown podcast URL", () => {
    test("22. POST play action for unknown podcast URL", async () => {
      const unknownPodcast = "http://unknown-podcast.example.com/feed.xml";
      const res = await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: unknownPodcast,
          episode: "http://unknown-podcast.example.com/ep1.mp3",
          action: "play",
          position: 60,
        },
      ]);
      expect(res.status).toBe(200);
    });

    test("23. GET subscriptions since=0 after auto-creation", async () => {
      const unknownPodcast = "http://unknown-podcast-2.example.com/feed.xml";

      // First create episode action for unknown podcast
      await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: unknownPodcast,
          episode: "http://unknown-podcast-2.example.com/ep1.mp3",
          action: "play",
          position: 60,
        },
      ]);

      // Check subscriptions
      const res = await alice.client.get(`/api/2/subscriptions/${username}/${deviceId}.json`, { since: "0" });
      const body = await alice.client.json(res);
      expect(body.add).toContain(unknownPodcast);
    });
  });

  describe("No server-side deduplication (matches reference)", () => {
    test("24. POST play pos=60 → POST play pos=120 (same episode) — both returned", async () => {
      const dedupTestPodcast = "http://dedup-test.example.com/feed.xml";
      const dedupTestEpisode = "http://dedup-test.example.com/ep.mp3";

      // First play
      await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: dedupTestPodcast,
          episode: dedupTestEpisode,
          action: "play",
          position: 60,
        },
      ]);

      // Second play at different position
      await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: dedupTestPodcast,
          episode: dedupTestEpisode,
          action: "play",
          position: 120,
        },
      ]);

      const res = await alice.client.get(`/api/2/episodes/${username}.json`, { since: "0" });
      const body = await alice.client.json(res);
      const playsForEpisode = body.actions.filter(
        (a: any) => a.episode === dedupTestEpisode && a.action === "play"
      );
      // Should have both entries (no dedup)
      expect(playsForEpisode.length).toBe(2);
    });

    test("25. POST download twice for same episode — both returned", async () => {
      const dedupTestPodcast = "http://dedup-test-2.example.com/feed.xml";
      const dedupTestEpisode = "http://dedup-test-2.example.com/ep.mp3";

      // First download
      await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: dedupTestPodcast,
          episode: dedupTestEpisode,
          action: "download",
        },
      ]);

      // Second download
      await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: dedupTestPodcast,
          episode: dedupTestEpisode,
          action: "download",
        },
      ]);

      const res = await alice.client.get(`/api/2/episodes/${username}.json`, { since: "0" });
      const body = await alice.client.json(res);
      const downloadsForEpisode = body.actions.filter(
        (a: any) => a.episode === dedupTestEpisode && a.action === "download"
      );
      expect(downloadsForEpisode.length).toBe(2);
    });

    test("26. POST play for different episodes — both returned", async () => {
      const testPodcast = "http://multi-ep-test.example.com/feed.xml";

      await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: testPodcast,
          episode: "http://multi-ep-test.example.com/ep1.mp3",
          action: "play",
          position: 100,
        },
        {
          podcast: testPodcast,
          episode: "http://multi-ep-test.example.com/ep2.mp3",
          action: "play",
          position: 200,
        },
      ]);

      const res = await alice.client.get(`/api/2/episodes/${username}.json`, { since: "0" });
      const body = await alice.client.json(res);
      const playsForPodcast = body.actions.filter(
        (a: any) => a.podcast === testPodcast && a.action === "play"
      );
      expect(playsForPodcast.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Query parameter filtering", () => {
    test("27. GET ?podcast=feedA filters by podcast", async () => {
      const feedA = "http://filter-test-a.example.com/feed.xml";
      const feedB = "http://filter-test-b.example.com/feed.xml";

      // Add subscriptions for both feeds
      await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [feedA, feedB],
        remove: [],
      });

      // Post actions for both podcasts
      await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: feedA,
          episode: "http://filter-test-a.example.com/ep1.mp3",
          action: "download",
          device: deviceId,
        },
        {
          podcast: feedB,
          episode: "http://filter-test-b.example.com/ep1.mp3",
          action: "download",
          device: deviceId,
        },
      ]);

      const res = await alice.client.get(`/api/2/episodes/${username}.json`, { podcast: feedA, since: "0" });
      const body = await alice.client.json(res);
      expect(body.actions.every((a: any) => a.podcast === feedA)).toBe(true);
      expect(body.actions.some((a: any) => a.podcast === feedB)).toBe(false);
    });

    test("28. GET ?device=phone filters by device", async () => {
      const testPodcast = "http://device-filter.example.com/feed.xml";

      // Create tablet device
      await alice.client.post(`/api/2/devices/${username}/tablet.json`, {
        caption: "Tablet",
        type: "tablet",
      });

      // Add subscription
      await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [testPodcast],
        remove: [],
      });

      // Post actions from different devices
      await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: testPodcast,
          episode: "http://device-filter.example.com/ep1.mp3",
          action: "download",
          device: deviceId, // phone
        },
        {
          podcast: testPodcast,
          episode: "http://device-filter.example.com/ep2.mp3",
          action: "download",
          device: "tablet",
        },
      ]);

      const res = await alice.client.get(`/api/2/episodes/${username}.json`, { device: deviceId, since: "0" });
      const body = await alice.client.json(res);
      expect(body.actions.every((a: any) => a.device === deviceId)).toBe(true);
    });

    test("29. GET ?aggregated=true returns latest action per episode", async () => {
      const aggTestPodcast = "http://agg-test.example.com/feed.xml";
      const aggTestEpisode = "http://agg-test.example.com/ep1.mp3";

      // Add subscription
      await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [aggTestPodcast],
        remove: [],
      });

      // Post multiple actions for same episode
      await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: aggTestPodcast,
          episode: aggTestEpisode,
          action: "download",
          device: deviceId,
        },
        {
          podcast: aggTestPodcast,
          episode: aggTestEpisode,
          action: "play",
          device: deviceId,
          position: 100,
        },
      ]);

      const res = await alice.client.get(`/api/2/episodes/${username}.json`, { aggregated: "true", since: "0" });
      const body = await alice.client.json(res);
      const episodeActions = body.actions.filter((a: any) => a.episode === aggTestEpisode);
      expect(episodeActions.length).toBe(1);
      expect(episodeActions[0].action).toBe("play"); // latest action
    });

    test("30. GET ?aggregated=true&since=T combined params", async () => {
      const comboTestPodcast = "http://combo-test.example.com/feed.xml";

      // Add subscription
      await alice.client.post(`/api/2/subscriptions/${username}/${deviceId}.json`, {
        add: [comboTestPodcast],
        remove: [],
      });

      // Post first action
      const res1 = await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: comboTestPodcast,
          episode: "http://combo-test.example.com/ep1.mp3",
          action: "download",
          device: deviceId,
        },
      ]);
      const body1 = await alice.client.json(res1);
      const T1 = body1.timestamp;

      // Post second action
      await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: comboTestPodcast,
          episode: "http://combo-test.example.com/ep1.mp3",
          action: "play",
          device: deviceId,
          position: 100,
        },
      ]);

      // Combined params: aggregated and since
      const res = await alice.client.get(`/api/2/episodes/${username}.json`, {
        aggregated: "true",
        since: String(T1),
      });
      const body = await alice.client.json(res);
      expect(body.actions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Access control", () => {
    test("31. GET bob's episodes as alice (403 extension)", async () => {
      // Create bob
      await new Client(serverUrl).post("/register", {
        username: "bob_episodes",
        password: "password",
        passwordConfirm: "password",
        captcha: "dummy",
        cc: "dummy",
      });

      const res = await alice.client.get("/api/2/episodes/bob_episodes.json");
      expect(res.status).toBe(403);
    });

    test("32. POST to bob's episodes as alice (403 extension)", async () => {
      const res = await alice.client.post("/api/2/episodes/bob_episodes.json", [
        {
          podcast: podcastUrl,
          episode: episodeUrl,
          action: "download",
        },
      ]);
      expect(res.status).toBe(403);
    });
  });
});
