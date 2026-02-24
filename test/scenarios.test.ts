import { describe, test, expect, beforeAll } from "bun:test";

import { Client } from "./helpers/client";
import { getServerUrl } from "./helpers/server";
import { createTestUser, type TestUser } from "./helpers/setup";

const url1 = "https://feeds.example.com/scenario1.xml";
const url2 = "https://feeds.example.com/scenario2.xml";
const url3 = "https://feeds.example.com/scenario3.xml";

describe("scenarios", () => {
  describe("Scenario 1: AntennaPod first sync", () => {
    let serverUrl: string;
    let alice: TestUser;
    let username: string;

    beforeAll(async () => {
      serverUrl = getServerUrl();
      username = `scenario1_alice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      alice = await createTestUser(serverUrl, {
        username,
        password: "password123",
      });
    });

    test("Full AntennaPod sync flow", async () => {
      // 1. Device already created via createTestUser - now add device
      const deviceRes = await alice.client.post(
        `/api/2/devices/${username}/antennapod-pixel8.json`,
        {
          caption: "Pixel 8",
          type: "mobile",
        },
      );
      expect(deviceRes.status).toBe(200);

      // 2. GET subscriptions since=0 → empty
      const initialSubs = await alice.client.get(
        `/api/2/subscriptions/${username}/antennapod-pixel8.json`,
        {
          since: "0",
        },
      );
      expect(initialSubs.status).toBe(200);
      const initialBody = await alice.client.json(initialSubs);
      expect(initialBody.add).toEqual([]);

      // 3. POST add 3 feeds
      const addRes = await alice.client.post(
        `/api/2/subscriptions/${username}/antennapod-pixel8.json`,
        {
          add: [url1, url2, url3],
          remove: [],
        },
      );
      expect(addRes.status).toBe(200);
      const addBody = await alice.client.json(addRes);
      const T1 = addBody.timestamp;

      // 4. GET since=T1 → includes all 3 (inclusive)
      const verifySubs = await alice.client.get(
        `/api/2/subscriptions/${username}/antennapod-pixel8.json`,
        {
          since: String(T1),
        },
      );
      const verifyBody = await alice.client.json(verifySubs);
      expect(verifyBody.add).toContain(url1);
      expect(verifyBody.add).toContain(url2);
      expect(verifyBody.add).toContain(url3);

      // 5. POST episode actions: download + play
      const ep1 = "http://example.com/scenario1-ep1.mp3";
      const episodeRes = await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: url1,
          episode: ep1,
          action: "download",
          device: "antennapod-pixel8",
        },
        {
          podcast: url1,
          episode: ep1,
          action: "play",
          position: 300,
          started: 0,
          total: 1800,
          device: "antennapod-pixel8",
        },
      ]);
      expect(episodeRes.status).toBe(200);
      await alice.client.json(episodeRes);

      // 6. GET episodes since=0 → both actions present
      const verifyEpisodes = await alice.client.get(`/api/2/episodes/${username}.json`, {
        since: "0",
      });
      const episodesBody = await alice.client.json(verifyEpisodes);
      const actionsForEp1 = episodesBody.actions.filter((a: any) => a.episode === ep1);
      expect(actionsForEp1.length).toBe(2);
      expect(actionsForEp1.some((a: any) => a.action === "download")).toBe(true);
      expect(actionsForEp1.some((a: any) => a.action === "play")).toBe(true);

      // 7. POST remove url1
      const removeRes = await alice.client.post(
        `/api/2/subscriptions/${username}/antennapod-pixel8.json`,
        {
          add: [],
          remove: [url1],
        },
      );
      expect(removeRes.status).toBe(200);
      const removeBody = await alice.client.json(removeRes);
      const T3 = removeBody.timestamp;

      // 8. GET since=T3 → remove contains url1
      const finalSubs = await alice.client.get(
        `/api/2/subscriptions/${username}/antennapod-pixel8.json`,
        {
          since: String(T3),
        },
      );
      const finalBody = await alice.client.json(finalSubs);
      expect(finalBody.remove).toContain(url1);
    });
  });

  describe("Scenario 2: Two-device sync", () => {
    let serverUrl: string;
    let alice: TestUser;
    let username: string;

    beforeAll(async () => {
      serverUrl = getServerUrl();
      username = `scenario2_alice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      alice = await createTestUser(serverUrl, {
        username,
        password: "password123",
      });
    });

    test("Devices share subscriptions and episodes", async () => {
      // 1. Create two devices
      await alice.client.post(`/api/2/devices/${username}/phone.json`, {
        caption: "Phone",
        type: "mobile",
      });
      await alice.client.post(`/api/2/devices/${username}/tablet.json`, {
        caption: "Tablet",
        type: "tablet",
      });

      // 2. Phone adds feedX
      const feedX = "https://feeds.example.com/scenario2-feedX.xml";
      const feedY = "https://feeds.example.com/scenario2-feedY.xml";

      await alice.client.post(`/api/2/subscriptions/${username}/phone.json`, {
        add: [feedX],
        remove: [],
      });

      // 3. Tablet adds feedY
      await alice.client.post(`/api/2/subscriptions/${username}/tablet.json`, {
        add: [feedY],
        remove: [],
      });

      // 4. Phone GETs subscriptions → sees both X and Y
      const phoneSubs = await alice.client.get(`/api/2/subscriptions/${username}/phone.json`, {
        since: "0",
      });
      const phoneBody = await alice.client.json(phoneSubs);
      expect(phoneBody.add).toContain(feedX);
      expect(phoneBody.add).toContain(feedY);

      // 5. Phone plays episode from X
      const epX = "http://example.com/scenario2-epX.mp3";
      await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: feedX,
          episode: epX,
          action: "play",
          position: 300,
          device: "phone",
        },
      ]);

      // 6. Tablet GETs episodes → sees Phone's play action
      const tabletEps = await alice.client.get(`/api/2/episodes/${username}.json`, {
        since: "0",
      });
      const tabletBody = await alice.client.json(tabletEps);
      const playActions = tabletBody.actions.filter(
        (a: any) => a.episode === epX && a.action === "play",
      );
      expect(playActions.length).toBeGreaterThanOrEqual(1);
      expect(playActions[0].device).toBe("phone");
    });
  });

  describe("Scenario 3: Re-subscribe and history", () => {
    let serverUrl: string;
    let alice: TestUser;
    let username: string;

    beforeAll(async () => {
      serverUrl = getServerUrl();
      username = `scenario3_alice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      alice = await createTestUser(serverUrl, {
        username,
        password: "password123",
      });
      await alice.client.post(`/api/2/devices/${username}/device.json`, {
        caption: "Device",
        type: "mobile",
      });
    });

    test("Re-subscribe history tracking", async () => {
      const feedZ = "https://feeds.example.com/scenario3-feedZ.xml";

      // 1. Subscribe to feedZ → T1
      const subRes = await alice.client.post(`/api/2/subscriptions/${username}/device.json`, {
        add: [feedZ],
        remove: [],
      });
      await alice.client.json(subRes);

      // 2. Remove feedZ → T2
      const removeRes = await alice.client.post(`/api/2/subscriptions/${username}/device.json`, {
        add: [],
        remove: [feedZ],
      });
      const removeBody = await alice.client.json(removeRes);
      const T2 = removeBody.timestamp;

      // 3. Re-subscribe to feedZ → T3
      const resubRes = await alice.client.post(`/api/2/subscriptions/${username}/device.json`, {
        add: [feedZ],
        remove: [],
      });
      const resubBody = await alice.client.json(resubRes);
      const T3 = resubBody.timestamp;

      // 4. GET since=0 → feedZ in add, not in remove (current state)
      const allRes = await alice.client.get(`/api/2/subscriptions/${username}/device.json`, {
        since: "0",
      });
      const allBody = await alice.client.json(allRes);
      expect(allBody.add).toContain(feedZ);

      // 5. GET since=T2 → feedZ in add (re-subscribe after T2)
      const sinceT2Res = await alice.client.get(`/api/2/subscriptions/${username}/device.json`, {
        since: String(T2),
      });
      const sinceT2Body = await alice.client.json(sinceT2Res);
      expect(sinceT2Body.add).toContain(feedZ);

      // 6. GET since=T3 → feedZ in add (inclusive)
      const sinceT3Res = await alice.client.get(`/api/2/subscriptions/${username}/device.json`, {
        since: String(T3),
      });
      const sinceT3Body = await alice.client.json(sinceT3Res);
      expect(sinceT3Body.add).toContain(feedZ);
    });
  });

  describe("Scenario 4: gPodder desktop token auth", () => {
    let serverUrl: string;
    let username: string;

    beforeAll(async () => {
      serverUrl = getServerUrl();
      username = `scenario4_alice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await createTestUser(serverUrl, {
        username,
        password: "password123",
      });
    });
  });

  describe("Scenario 5: Play position deduplication (bpodder extension)", () => {
    let serverUrl: string;
    let alice: TestUser;
    let username: string;

    beforeAll(async () => {
      serverUrl = getServerUrl();
      username = `scenario6_alice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      alice = await createTestUser(serverUrl, {
        username,
        password: "password123",
      });
      await alice.client.post(`/api/2/devices/${username}/phone.json`, {
        caption: "Phone",
        type: "mobile",
      });
      await alice.client.post(`/api/2/devices/${username}/tablet.json`, {
        caption: "Tablet",
        type: "tablet",
      });
    });

    test("Deduplication (bpodder-specific extension)", async () => {
      const podcastUrl = "http://dedup-scenario.example.com/feed.xml";
      const episodeUrl = "http://dedup-scenario.example.com/ep1.mp3";

      // Subscribe to podcast
      await alice.client.post(`/api/2/subscriptions/${username}/phone.json`, {
        add: [podcastUrl],
        remove: [],
      });

      // Record actions from phone (play at position 100)
      await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: podcastUrl,
          episode: episodeUrl,
          action: "play",
          device: "phone",
          position: 100,
        },
      ]);

      // Record actions from tablet (play at position 250 - later)
      await alice.client.post(`/api/2/episodes/${username}.json`, [
        {
          podcast: podcastUrl,
          episode: episodeUrl,
          action: "play",
          device: "tablet",
          position: 250,
        },
      ]);

      // Without aggregation - should see both actions
      const allRes = await alice.client.get(`/api/2/episodes/${username}.json`, {
        since: "0",
      });
      const allBody = await alice.client.json<EpisodesResponse>(allRes);
      const allActions = allBody.actions.filter((a: any) => a.episode === episodeUrl);
      expect(allActions.length).toBe(2);

      // With aggregation - should see only latest action (tablet at position 250)
      const aggRes = await alice.client.get(`/api/2/episodes/${username}.json`, {
        since: "0",
        aggregated: "true",
      });
      const aggBody = await alice.client.json<EpisodesResponse>(aggRes);
      const aggActions = aggBody.actions.filter((a: any) => a.episode === episodeUrl);
      expect(aggActions.length).toBe(1);
      expect(aggActions[0].action).toBe("play");
      expect(aggActions[0].position).toBe(250);
      expect(aggActions[0].device).toBe("tablet");
    });
  });
});
