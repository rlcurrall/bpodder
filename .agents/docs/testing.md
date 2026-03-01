# Testing

All tests are integration tests that run against a live server.

## Setup

```bash
ENABLE_REGISTRATION=true bun run start     # Terminal 1
TEST_URL=http://localhost:8080 bun test     # Terminal 2
```

## Helpers

- `createTestUser(serverUrl, opts?)` from `test/helpers/setup.ts` — registers and logs in a test user, returns authenticated client
- Test usernames are timestamp-based: `testuser_${Date.now()}_${random}` to avoid collisions
- HTTP client in `test/helpers/client.ts` with `.withBasicAuth()`, `.withCookie()`, `.withTokenAuth()` methods
- Mock RSS server in `test/helpers/mock-rss.ts` for feed-related tests

## Pattern

```typescript
describe("feature", () => {
  let serverUrl: string;
  let alice: TestUser;

  beforeAll(async () => {
    serverUrl = getServerUrl();
    alice = await createTestUser(serverUrl);
  });

  test("does something", async () => {
    const res = await alice.client.get("/api/2/...");
    expect(res.status).toBe(200);
  });
});
```
