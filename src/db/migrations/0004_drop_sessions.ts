import type { Database } from "bun:sqlite";

export const name = "0004_drop_sessions";

export function up(db: Database): void {
  db.run("DROP TABLE IF EXISTS sessions");
}
