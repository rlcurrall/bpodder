import { Database, Statement } from "bun:sqlite";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

export function createDB(path: string): DB {
  const db = new Database(path);
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA busy_timeout = 5000");
  runMigrations(db);
  return new DB(db);
}

export class DB {
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

  queryWithData<T>(sql: string, ...params: unknown[]): T[] {
    const rows = this.all<any>(sql, ...params);
    return rows.map((row) => {
      if (row.data) {
        try {
          const data = JSON.parse(row.data);
          // Merge data into row, but row properties take precedence
          return { ...data, ...row };
        } catch {
          // Invalid JSON, return as-is
          return row;
        }
      }
      return row;
    });
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
  // Get current version
  const result = db.query("PRAGMA user_version").get() as {
    user_version: number;
  };
  const currentVersion = result.user_version;

  // Read schema.sql for initial setup (version 1)
  if (currentVersion === 0) {
    const schemaPath = join(import.meta.dir, "schema.sql");
    try {
      const schema = readFileSync(schemaPath, "utf-8");
      db.run(schema);
      // Set version to 1 so migrations 1+ don't run on fresh databases
      // (schema.sql already includes all schema changes up to version 1)
      db.run("PRAGMA user_version = 1");
    } catch (error) {
      console.error("Failed to load schema.sql:", error);
      throw error;
    }
  }

  // Look for numbered migration files
  const migrationsDir = join(import.meta.dir, "migrations");
  let migrations: { version: number; path: string }[] = [];

  try {
    const files = readdirSync(migrationsDir);
    migrations = files
      .filter((f) => f.endsWith(".sql"))
      .map((f) => {
        const match = f.match(/^(\d+)_.*\.sql$/);
        if (match) {
          return {
            version: parseInt(match[1], 10),
            path: join(migrationsDir, f),
          };
        }
        return null;
      })
      .filter((m): m is { version: number; path: string } => m !== null)
      .sort((a, b) => a.version - b.version);
  } catch {
    // Migrations directory doesn't exist or is empty
  }

  // Run pending migrations
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      const sql = readFileSync(migration.path, "utf-8");
      db.run("BEGIN IMMEDIATE");
      try {
        db.run(sql);
        db.run(`PRAGMA user_version = ${migration.version}`);
        db.run("COMMIT");
      } catch (error) {
        db.run("ROLLBACK");
        console.error(`Migration ${migration.version} failed:`, error);
        throw error;
      }
    }
  }
}
