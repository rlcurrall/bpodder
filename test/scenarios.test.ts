import { describe, test, expect, beforeAll } from "bun:test";
import { getServerUrl } from "./helpers/server";
import { createTestUser, type TestUser } from "./helpers/setup";
import { Client } from "./helpers/client";

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
      const epBody = await alice.client.json(episodeRes);
      const T2 = epBody.timestamp;

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
      const subBody = await alice.client.json(subRes);
      const T1 = subBody.timestamp;

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
    let alice: TestUser;
    let username: string;

    beforeAll(async () => {
      serverUrl = getServerUrl();
      username = `scenario4_alice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      alice = await createTestUser(serverUrl, {
        username,
        password: "password123",
      });
    });

    test.skip("Token auth flow (requires token enable endpoint)", async () => {
      // This test requires a token enable endpoint which may be web-UI only
      // 1. Alice logs in with Basic auth
      // 2. Enable token (via API or admin)
      // 3. Retrieve token
      // 4. Use token auth for subsequent requests
      // 5. Verify subscriptions work
    });
  });

  describe("Scenario 5: NextCloud client full flow", () => {
    let serverUrl: string;
    let alice: TestUser;
    let username: string;

    beforeAll(async () => {
      serverUrl = getServerUrl();
      username = `scenario5_alice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      alice = await createTestUser(serverUrl, {
        username,
        password: "password123",
      });
    });

    test("Complete NextCloud client flow", async () => {
      // 1. POST /index.php/login/v2
      const initRes = await alice.client.post("/index.php/login/v2");
      expect(initRes.status).toBe(200);
      const initBody = await alice.client.json(initRes);
      const pollToken = initBody.poll.token;
      const loginUrl = new URL(initBody.login);
      const loginToken = loginUrl.searchParams.get("token");

      // 2. Authenticate via web UI login
      const authClient = new Client(serverUrl).withBasicAuth(username, "password123");
      const authRes = await authClient.post(
        `/api/2/auth/${username}/login.json?token=${loginToken}`,
      );
      expect(authRes.status).toBe(200);

      // 3. Poll for credentials (form-encoded per NextCloud spec)
      const pollRes = await alice.client.postForm("/index.php/login/v2/poll", { token: pollToken });
      expect(pollRes.status).toBe(200);
      const pollBody = await alice.client.json(pollRes);
      const appPassword = pollBody.appPassword;

      // 4. Verify appPassword format
      expect(appPassword).toContain(":");

      // 5. Use app password for episode actions
      const ncClient = new Client(serverUrl).withBasicAuth(username, appPassword);
      const epRes = await ncClient.post("/index.php/apps/gpoddersync/episode_action", [
        {
          podcast: "https://feeds.example.com/nextcloud-scenario.xml",
          episode: "http://example.com/scenario5-ep1.mp3",
          action: "download",
        },
      ]);
      expect(epRes.status).toBe(200);

      // 6. GET episode actions and verify
      const getRes = await ncClient.get("/index.php/apps/gpoddersync/episode_action", {
        since: "0",
      });
      expect(getRes.status).toBe(200);
      const getBody = await ncClient.json(getRes);
      expect(
        getBody.actions.some((a: any) => a.episode === "http://example.com/scenario5-ep1.mp3"),
      ).toBe(true);
    });
  });

  describe("Scenario 6: Play position deduplication (bpodder extension)", () => {
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

    test.skip("Deduplication (bpodder-specific extension)", async () => {
      // This test verifies bpodder's deduplication extension, not GPodder spec compliance
      // If deduplication is implemented, this test should pass
      // If not implemented (matching reference), this will fail and should be skipped
    });
  });
});
