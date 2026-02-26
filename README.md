# bpodder

A self-hosted podcast sync server implementing the [GPodder API v2](https://gpoddernet.readthedocs.io/en/latest/api/).

## Why bpodder?

bpodder aims to be:

- **Simple to host** — a single binary with SQLite, no external database needed
- **Easy to configure** — everything via environment variables
- **Lightweight** — built on [Bun](https://bun.sh) with minimal dependencies
- **Compatible** — works with any podcast app that supports the GPodder sync protocol (AntennaPod, gPodder, etc.)

## Quick Start

### Docker (recommended)

```bash
docker run -d \
  --name bpodder \
  -p 8080:8080 \
  -v bpodder-data:/data \
  -e ENABLE_REGISTRATION=true \
  ghcr.io/rlcurrall/bpodder:latest
```

### Docker Compose

```yaml
services:
  bpodder:
    image: ghcr.io/rlcurrall/bpodder:latest
    ports:
      - "8080:8080"
    volumes:
      - bpodder-data:/data
    environment:
      - ENABLE_REGISTRATION=true
    restart: unless-stopped

volumes:
  bpodder-data:
```

### From Source

Requires [Bun](https://bun.sh) 1.2+.

```bash
bun install
bun run start
```

To compile a standalone binary (no Bun runtime needed to run it):

```bash
bun run build                # Build all platforms
bun run build -- linux-x64   # Linux x86_64 only
bun run build -- linux-arm64 # Linux ARM64 only
bun run build -- darwin      # macOS ARM64 only
```

Binaries are written to `dist/`. Run directly:

```bash
./dist/bpodder-linux-x64
```

## Configuration

All configuration is done through environment variables.

| Variable              | Default                   | Description                                           |
| --------------------- | ------------------------- | ----------------------------------------------------- |
| `PORT`                | `8080`                    | Server port                                           |
| `HOST`                | `0.0.0.0`                 | Listen address                                        |
| `DATA_ROOT`           | `./data`                  | Directory for database and app data                   |
| `DB_FILE`             | `{DATA_ROOT}/data.sqlite` | SQLite database path                                  |
| `ENABLE_REGISTRATION` | `false`                   | Allow new user registration                           |
| `TITLE`               | `bpodder`                 | Server title                                          |
| `BASE_URL`            | _(empty)_                 | Public base URL (e.g. `https://podcasts.example.com`) |
| `MAX_BODY_SIZE`       | `5242880`                 | Max request body size in bytes (5MB)                  |
| `LOG_LEVEL`           | `info`                    | Log level: `debug`, `info`, `warn`, `error`, `silent` |
| `LOG_FORMAT`          | auto                      | `json` in production, `pretty` in development         |

## API Compatibility

bpodder implements the GPodder API v2 including:

- Authentication (login/logout)
- Device management
- Subscription sync with delta updates
- Episode action tracking
- Settings storage
- Device synchronization

Configure your podcast app to use `http://<your-server>:8080` as the GPodder sync server.

## Roadmap

The core sync functionality is fully implemented. The remaining GPodder API features are primarily discovery and social features that aren't needed for syncing between podcast apps.

### Implemented

- [x] Authentication (login/logout)
- [x] Device management
- [x] Subscriptions (Simple API + Advanced API with delta sync)
- [x] Episode actions (upload, query, filtering, aggregation)
- [x] Settings (account, device, podcast, episode scopes)
- [x] Device synchronization groups

### Not Yet Implemented

- [ ] Directory (browse by tag, top lists, search)
- [ ] Suggestions
- [ ] Favorites
- [ ] Podcast lists
- [ ] Device updates (combined subscription + episode endpoint)
- [ ] Client configuration endpoint

## Development

```bash
bun install
bun run dev          # Start with hot reload and debug logging
bun run lint         # Run linter
bun run fmt          # Format code
bun run build        # Build release binaries
```

## License

MIT
