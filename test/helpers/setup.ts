import { Client, cookie } from "./client";

export interface TestUser {
  username: string;
  password: string;
  client: Client;
  sessionCookie: string;
}

export async function createTestUser(
  serverUrl: string,
  opts: { username?: string; password?: string } = {},
): Promise<TestUser> {
  const username =
    opts.username ?? `testuser_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const password = opts.password ?? "password123";

  const client = new Client(serverUrl);

  // Register user
  const registerRes = await client.post("/api/b-ext/register", {
    username,
    password,
    passwordConfirm: password,
    captcha: "dummy", // Captcha is disabled in test config
    cc: "dummy", // Check value
  });

  if (!registerRes.ok && registerRes.status !== 200) {
    // Try logging in anyway (user might already exist from previous test run)
    const loginRes = await client
      .withBasicAuth(username, password)
      .post(`/api/2/auth/${username}/login.json`);
    if (!loginRes.ok) {
      throw new Error(`Failed to register user ${username}: ${registerRes.status}`);
    }
  }

  // Login to get session
  const loginRes = await client
    .withBasicAuth(username, password)
    .post(`/api/2/auth/${username}/login.json`);
  if (!loginRes.ok) {
    throw new Error(`Failed to login as ${username}: ${loginRes.status}`);
  }

  const sessionCookie = cookie(loginRes, "sessionid");
  if (!sessionCookie) {
    throw new Error("No session cookie received after login");
  }

  // Create authenticated client
  const authClient = client
    .withBasicAuth(username, password)
    .withCookie(`sessionid=${sessionCookie}`);

  return {
    username,
    password,
    client: authClient,
    sessionCookie: `sessionid=${sessionCookie}`,
  };
}
