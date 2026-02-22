import { describe, test, expect, beforeAll } from "bun:test";
import { getServerUrl } from "./helpers/server";
import { createTestUser, type TestUser } from "./helpers/setup";
import { Client } from "./helpers/client";

describe("nextcloud", () => {
  let serverUrl: string;
  let alice: TestUser;

  beforeAll(async () => {
    serverUrl = getServerUrl();
    alice = await createTestUser(serverUrl, { username: "alice_nc", password: "password123" });
  });

  test("1. POST /index.php/login/v2", async () => {
    const res = await alice.client.post("/index.php/login/v2");
    expect(res.status).toBe(200);
    const body = await alice.client.json(res);
    expect(body.poll).toBeDefined();
    expect(body.poll.token).toBeDefined();
    expect(body.poll.endpoint).toBeDefined();
    expect(body.login).toBeDefined();
    expect(body.login).toContain("token=");
  });

  test("2. POST /index.php/login/v2/poll before auth returns 404", async () => {
    // First initiate login
    const initRes = await alice.client.post("/index.php/login/v2");
    const initBody = await alice.client.json(initRes);
    const token = initBody.poll.token;

    // Poll before authentication - should return 404 (not 401)
    const pollRes = await alice.client.postForm("/index.php/login/v2/poll", { token });
    expect(pollRes.status).toBe(404);
  });

  test("3. POST /index.php/login/v2/poll with unknown token", async () => {
    const res = await alice.client.postForm("/index.php/login/v2/poll", { token: "unknown_token_12345" });
    expect(res.status).toBe(404);
  });

  test("4. Authenticate and poll returns credentials", async () => {
    // This test requires the full flow:
    // 1. Initiate login
    // 2. Authenticate via web UI (simulated)
    // 3. Poll for credentials

    // Step 1: Initiate
    const initRes = await alice.client.post("/index.php/login/v2");
    const initBody = await alice.client.json(initRes);
    const pollToken = initBody.poll.token;

    // Step 2: Authenticate (simulate web UI login)
    // The login URL contains the token as a query parameter
    const loginUrl = new URL(initBody.login);
    const loginToken = loginUrl.searchParams.get("token");

    // Authenticate with the token
    const authClient = new Client(serverUrl).withBasicAuth("alice_nc", "password123");
    const authRes = await authClient.post(`/api/2/auth/alice_nc/login.json?token=${loginToken}`);
    expect(authRes.status).toBe(200);

    // Step 3: Poll
    const pollRes = await alice.client.postForm("/index.php/login/v2/poll", { token: pollToken });
    expect(pollRes.status).toBe(200);
    const pollBody = await alice.client.json(pollRes);
    expect(pollBody.server).toBeDefined();
    expect(pollBody.loginName).toBe("alice_nc");
    expect(pollBody.appPassword).toBeDefined();
  });

  test("5. App password format verification", async () => {
    // Get app password from login flow
    const initRes = await alice.client.post("/index.php/login/v2");
    const initBody = await alice.client.json(initRes);
    const pollToken = initBody.poll.token;
    const loginToken = new URL(initBody.login).searchParams.get("token");

    // Authenticate
    const authClient = new Client(serverUrl).withBasicAuth("alice_nc", "password123");
    await authClient.post(`/api/2/auth/alice_nc/login.json?token=${loginToken}`);

    // Poll
    const pollRes = await alice.client.postForm("/index.php/login/v2/poll", { token: pollToken });
    const pollBody = await alice.client.json(pollRes);

    // Verify format: token:sha1(bcrypt_hash + token)
    const appPassword = pollBody.appPassword;
    expect(appPassword).toContain(":");
    const [tokenPart, hashPart] = appPassword.split(":");
    expect(tokenPart).toBeDefined();
    expect(hashPart).toBeDefined();
    expect(hashPart.length).toBe(40); // SHA1 is 40 hex chars
  });

  test("6. Use app password in Basic auth", async () => {
    // Complete flow to get app password
    const initRes = await alice.client.post("/index.php/login/v2");
    const initBody = await alice.client.json(initRes);
    const pollToken = initBody.poll.token;
    const loginToken = new URL(initBody.login).searchParams.get("token");

    await new Client(serverUrl)
      .withBasicAuth("alice_nc", "password123")
      .post(`/api/2/auth/alice_nc/login.json?token=${loginToken}`);

    const pollRes = await alice.client.postForm("/index.php/login/v2/poll", { token: pollToken });
    const pollBody = await alice.client.json(pollRes);
    const appPassword = pollBody.appPassword;

    // Use app password for request
    const ncClient = new Client(serverUrl).withBasicAuth("alice_nc", appPassword);
    const res = await ncClient.get("/api/2/devices/alice_nc.json");
    expect(res.status).toBe(200);
  });

  test("7. Use app password with wrong hash", async () => {
    const wrongPassword = "wrong_token:1234567890abcdef1234567890abcdef12345678";
    const ncClient = new Client(serverUrl).withBasicAuth("alice_nc", wrongPassword);
    const res = await ncClient.get("/api/2/devices/alice_nc.json");
    expect(res.status).toBe(401);
  });

  test("8. Poll token single-use", async () => {
    // Complete flow
    const initRes = await alice.client.post("/index.php/login/v2");
    const initBody = await alice.client.json(initRes);
    const pollToken = initBody.poll.token;
    const loginToken = new URL(initBody.login).searchParams.get("token");

    await new Client(serverUrl)
      .withBasicAuth("alice_nc", "password123")
      .post(`/api/2/auth/alice_nc/login.json?token=${loginToken}`);

    // First poll should succeed
    const pollRes1 = await alice.client.postForm("/index.php/login/v2/poll", { token: pollToken });
    expect(pollRes1.status).toBe(200);

    // Second poll should fail (single-use)
    const pollRes2 = await alice.client.postForm("/index.php/login/v2/poll", { token: pollToken });
    expect(pollRes2.status).toBe(404);
  });

  test("9. GET /index.php/apps/gpoddersync/episode_action", async () => {
    const res = await alice.client.get("/index.php/apps/gpoddersync/episode_action", { since: "0" });
    expect(res.status).toBe(200);
    const body = await alice.client.json(res);
    expect(body.timestamp).toBeDefined();
    expect(body.actions).toBeDefined();
  });

  test("10. POST /index.php/apps/gpoddersync/episode_action", async () => {
    const res = await alice.client.post("/index.php/apps/gpoddersync/episode_action", [
      {
        podcast: "http://example.com/podcast.xml",
        episode: "http://example.com/ep1.mp3",
        action: "download",
      },
    ]);
    expect(res.status).toBe(200);

    // Verify via GPodder API
    const getRes = await alice.client.get("/api/2/episodes/alice_nc.json", { since: "0" });
    const body = await alice.client.json(getRes);
    expect(body.actions.some((a: any) => a.episode === "http://example.com/ep1.mp3")).toBe(true);
  });

  test("11. POST /index.php/apps/gpoddersync/subscriptions", async () => {
    const res = await alice.client.get("/index.php/apps/gpoddersync/subscriptions", { since: "0" });
    expect(res.status).toBe(200);
    const body = await alice.client.json(res);
    expect(body.add).toBeDefined();
    expect(body.remove).toBeDefined();
  });

  test("12. POST /index.php/apps/gpoddersync/subscription_change/create", async () => {
    const res = await alice.client.post("/index.php/apps/gpoddersync/subscription_change/create", {
      add: ["https://feeds.example.com/nextcloud-test.xml"],
      remove: [],
    });
    expect(res.status).toBe(200);

    // Verify via GPodder API
    const getRes = await alice.client.get("/api/2/subscriptions/alice_nc/default.json", { since: "0" });
    const body = await alice.client.json(getRes);
    expect(body.add).toContain("https://feeds.example.com/nextcloud-test.xml");
  });

  test("13. POST nonexistent NextCloud endpoint", async () => {
    const res = await alice.client.post("/index.php/apps/gpoddersync/nonexistent");
    expect(res.status).toBe(404);
  });
});
