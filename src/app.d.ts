interface AppContext {
  db: AppDatabase;
  config: Config;
  sessions: SessionStorage;
  logger: import("pino").Logger;
}

interface AppDatabase {
  first<T>(sql: string, ...params: unknown[]): T | null;
  all<T>(sql: string, ...params: unknown[]): T[];
  run(sql: string, ...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  transaction<T>(fn: () => T): T;
  upsert(table: string, row: Record<string, unknown>, conflictCols: string[]): void;
  close(): void;
}

interface Config {
  port: number;
  dataRoot: string;
  dbFile: string;
  baseUrl: string;
  enableRegistration: boolean;
  title: string;
  maxBodySize: number;
  captchaSecret: string;
  logLevel: "debug" | "info" | "warn" | "error" | "silent";
  logFormat: "json" | "pretty";
}

interface SessionStorage {
  create(userId: number): Promise<string>;
  get(sessionId: string): Promise<{ userId: number } | null>;
  delete(sessionId: string): Promise<void>;
  close(): void;
}
