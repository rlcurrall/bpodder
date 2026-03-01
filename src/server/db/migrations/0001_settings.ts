import type { Database } from "bun:sqlite";

export const name = "0001_settings";

export function up(db: Database): void {
  db.run(`
    CREATE TABLE settings (
      id INTEGER PRIMARY KEY,
      user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      scope TEXT NOT NULL,
      scope_id TEXT NOT NULL DEFAULT '',
      key TEXT NOT NULL,
      value TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE UNIQUE INDEX settings_unique ON settings (user, scope, scope_id, key)
  `);
}
