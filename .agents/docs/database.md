# Database

SQLite via `bun:sqlite` with WAL mode.

## DB Class (`src/db/index.ts`)

- `first<T>(sql, ...params): T | null`
- `all<T>(sql, ...params): T[]`
- `run(sql, ...params): { changes, lastInsertRowid }`
- `transaction<T>(fn): T`
- `upsert(table, row, conflictCols)` — INSERT OR REPLACE
- `queryWithData<T>(sql, ...params): T[]` — parses JSON `data` column and merges into row

Prepared statements are cached in an unbounded Map for reuse.

## Migrations

- Tracked in `_migrations` table (not PRAGMA user_version)
- Files in `src/db/migrations/` export `name: string` and `up(db: Database): void`
- Run automatically on startup, wrapped in transactions

## Schema Conventions

- Foreign keys with CASCADE/SET NULL
- JSON `data` columns for extensibility
- Soft deletes on subscriptions (`deleted = 0/1`) for GPodder delta sync
- `changed` column (Unix seconds) for `?since=` query support
