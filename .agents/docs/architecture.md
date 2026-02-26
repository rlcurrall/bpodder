# Architecture & Conventions

## App Factory

`createApp(cfg?)` in `src/index.ts` wires up all components. It creates the DB, SessionStore, and Logger, bundles them into an `AppContext` object, and passes that to handler factories via closures.

## Handler Factories

Each domain has a factory: `createXxxHandlers(ctx: AppContext)` returns route definitions. Routing uses Bun.serve native `routes` with `:param` segments.

## Key Conventions

- Config via env vars, parsed with Zod in `src/config.ts`
- Response helpers (`src/lib/response.ts`) add CORS headers automatically
- Request bodies validated with Zod schemas in `src/lib/schemas.ts`
- Subscriptions use soft deletes (`deleted = 0/1`) for GPodder delta sync
- `changed` timestamps are Unix seconds (not ms) for `?since=` queries
- `data` JSON columns merged into result rows via `db.queryWithData()`
- URL username `current` resolves to authenticated user
- Multi-row writes wrapped in `ctx.db.transaction()`
- File extensions (.json/.opml/.txt) stripped via `parseParam()` since GPodder clients encode format in the URL
- Sessions stored in separate SQLite DB (`data/sessions.sqlite`) with LRU cache
