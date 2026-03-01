import { Database, Statement } from "bun:sqlite";

import { LRUCache } from "../lib/cache";
import { migrations } from "./migrations";

export function createDB(path: string): DB {
  const db = new Database(path);
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA busy_timeout = 5000");
  runMigrations(db);
  return new DB(db);
}

export class DB implements AppDatabase {
  private db: Database;
  private statements: LRUCache<string, Statement>;
  private txDepth = 0;
  private closed = false;
  private static readonly MAX_CACHED_STATEMENTS = 1000;

  constructor(db: Database) {
    this.db = db;
    this.statements = new LRUCache<string, Statement>(DB.MAX_CACHED_STATEMENTS);
  }

  first<T>(sql: string, ...params: unknown[]): T | null {
    this.assertOpen();
    const stmt = this.getStatement(sql);
    return stmt.get(...params) as T | null;
  }

  all<T>(sql: string, ...params: unknown[]): T[] {
    this.assertOpen();
    const stmt = this.getStatement(sql);
    return stmt.all(...params) as T[];
  }

  run(sql: string, ...params: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
    this.assertOpen();
    const stmt = this.getStatement(sql);
    return stmt.run(...params);
  }

  transaction<T>(fn: () => T): T {
    this.assertOpen();
    const isNested = this.txDepth > 0;
    const savepointName = `sp_${this.txDepth}`;

    if (isNested) {
      this.db.run(`SAVEPOINT ${savepointName}`);
    } else {
      this.db.run("BEGIN IMMEDIATE");
    }

    this.txDepth++;

    try {
      const result = fn();
      this.txDepth--;

      if (isNested) {
        this.db.run(`RELEASE SAVEPOINT ${savepointName}`);
      } else {
        this.db.run("COMMIT");
      }

      return result;
    } catch (error) {
      this.txDepth--;

      try {
        if (isNested) {
          this.db.run(`ROLLBACK TO SAVEPOINT ${savepointName}`);
          this.db.run(`RELEASE SAVEPOINT ${savepointName}`);
        } else {
          this.db.run("ROLLBACK");
        }
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Transaction failed and rollback also failed",
        );
      }

      throw error;
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.statements.clear();
    this.db.close();
    this.closed = true;
  }

  private getStatement(sql: string): Statement {
    this.assertOpen();
    let stmt = this.statements.get(sql);
    if (!stmt) {
      stmt = this.db.prepare(sql);
      this.statements.set(sql, stmt);
    }
    return stmt;
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error("database is closed");
    }
  }
}

export function runMigrations(db: Database): void {
  // Create migrations tracking table
  db.run(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Get list of already applied migrations
  const applied = new Set(
    (db.query("SELECT name FROM _migrations").all() as { name: string }[]).map((r) => r.name),
  );

  // Run pending migrations
  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;

    db.run("BEGIN IMMEDIATE");
    try {
      migration.up(db);
      db.run("INSERT INTO _migrations (name) VALUES (?)", [migration.name]);
      db.run("COMMIT");
    } catch (error) {
      try {
        db.run("ROLLBACK");
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `Migration "${migration.name}" failed and rollback also failed`,
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration "${migration.name}" failed: ${message}`);
    }
  }
}
