import { Database, Statement } from "bun:sqlite";

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
  private statements: Map<string, Statement> = new Map();

  constructor(db: Database) {
    this.db = db;
  }

  first<T>(sql: string, ...params: unknown[]): T | null {
    const stmt = this.getStatement(sql);
    return stmt.get(...params) as T | null;
  }

  all<T>(sql: string, ...params: unknown[]): T[] {
    const stmt = this.getStatement(sql);
    return stmt.all(...params) as T[];
  }

  run(sql: string, ...params: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
    const stmt = this.getStatement(sql);
    return stmt.run(...params);
  }

  transaction<T>(fn: () => T): T {
    this.db.run("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.run("COMMIT");
      return result;
    } catch (error) {
      this.db.run("ROLLBACK");
      throw error;
    }
  }

  upsert(table: string, row: Record<string, unknown>, conflictCols: string[]): void {
    const columns = Object.keys(row);
    const placeholders = columns.map(() => "?").join(", ");
    const updateCols = columns.filter((c) => !conflictCols.includes(c));

    if (conflictCols.length === 0) {
      throw new Error("upsert requires at least one conflict column");
    }

    const sql = `
      INSERT INTO ${table} (${columns.join(", ")})
      VALUES (${placeholders})
      ON CONFLICT(${conflictCols.join(", ")})
      DO UPDATE SET ${updateCols.map((c) => `${c} = excluded.${c}`).join(", ")}
    `;

    this.run(sql, ...Object.values(row));
  }

  close(): void {
    this.db.close();
  }

  private getStatement(sql: string): Statement {
    if (!this.statements.has(sql)) {
      this.statements.set(sql, this.db.prepare(sql));
    }
    return this.statements.get(sql)!;
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
      db.run("ROLLBACK");
      console.error(`Migration "${migration.name}" failed:`, error);
      throw error;
    }
  }
}
