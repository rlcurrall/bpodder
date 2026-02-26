# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

bpodder is a self-hosted podcast sync server implementing the GPodder API v2, built on Bun (1.2+) with minimal dependencies (pino, zod).

## Commands

```bash
bun run dev                    # Dev server (watch + debug logging)
bun run build                  # Build all release binaries
bun run build -- linux-x64     # Build single platform (linux-arm64, darwin)
bun run lint                   # oxlint
bun run lint:fix               # oxlint --fix
bun run fmt                    # oxfmt
docker build -t bpodder .      # Build Docker image
```

### Testing

Integration tests run against a live server — two terminals required:

```bash
ENABLE_REGISTRATION=true bun run start                          # Terminal 1
TEST_URL=http://localhost:8080 bun test                         # Terminal 2
TEST_URL=http://localhost:8080 bun test test/auth.test.ts       # Single file
TEST_URL=http://localhost:8080 bun test --test-name-pattern="login"  # Single test
```

## Detailed Guides

- [Architecture & conventions](.agents/docs/architecture.md) — app factory, handler pattern, key conventions
- [Code style](.agents/docs/code-style.md) — imports, naming, error handling
- [Database](.agents/docs/database.md) — schema conventions, migrations, DB class API
- [Testing](.agents/docs/testing.md) — helpers, test user setup, mock server
- [Reference material](reference/) — GPodder API spec, architecture spec, test plan
