import { Database, type Statement } from "bun:sqlite";

import { LRUCache } from "./cache";
import { forbidden, unauthorized } from "./response";

export interface User {
  id: number;
  name: string;
  password: string;
}

interface SessionEntry {
  userId: number;
  expiresAt: number;
}

interface SessionPreparedStatements {
  insert: Statement;
  selectById: Statement<{ user_id: number; expires_at: number } | null>;
  deleteById: Statement;
  deleteExpired: Statement;
  selectUnexpired: Statement<{ id: string; user_id: number; expires_at: number }>;
}

export class SessionStore implements SessionStorage {
  private db: Database;
  private cache: LRUCache<string, SessionEntry>;
  private statements: SessionPreparedStatements;
  private maxCacheSize: number;
  private requestCount = 0;
  private readonly cleanupInterval = 100;

  constructor(dbPath: string, maxCacheSize = 1000) {
    // Open raw bun:sqlite Database
    this.db = new Database(dbPath);
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA busy_timeout = 5000");

    // Create schema inline (no FK constraint - cross-DB FK impossible)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at)
    `);

    // Prepare statements once
    this.statements = {
      insert: this.db.prepare(
        "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
      ),
      selectById: this.db.prepare("SELECT user_id, expires_at FROM sessions WHERE id = ?"),
      deleteById: this.db.prepare("DELETE FROM sessions WHERE id = ?"),
      deleteExpired: this.db.prepare("DELETE FROM sessions WHERE expires_at < ?"),
      selectUnexpired: this.db.prepare(
        "SELECT id, user_id, expires_at FROM sessions WHERE expires_at > ? ORDER BY created_at DESC LIMIT ?",
      ),
    };

    this.maxCacheSize = maxCacheSize;
    this.cache = new LRUCache(maxCacheSize);

    // Clean expired rows and warm cache on construction
    this.initializeCache();
  }

  private initializeCache(): void {
    const now = Math.floor(Date.now() / 1000);

    // Clean expired rows first
    this.statements.deleteExpired.run(now);

    // Warm cache: fetch newest N sessions, insert oldest-first so newest
    // end up at the LRU tail (most recently used position)
    const rows = this.statements.selectUnexpired.all(now, this.maxCacheSize).reverse();

    for (const row of rows) {
      this.cache.set(row.id, { userId: row.user_id, expiresAt: row.expires_at });
    }
  }

  async create(userId: number): Promise<string> {
    const sessionId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 30 * 24 * 60 * 60; // 30 days

    // Write to SQLite
    this.statements.insert.run(sessionId, userId, now, expiresAt);

    // Write to cache
    this.cache.set(sessionId, { userId, expiresAt });

    return sessionId;
  }

  async get(sessionId: string): Promise<{ userId: number } | null> {
    // Check cache first
    const cached = this.cache.get(sessionId);
    if (cached) {
      if (cached.expiresAt < Math.floor(Date.now() / 1000)) {
        this.cache.delete(sessionId);
        this.statements.deleteById.run(sessionId);
        return null;
      }
      return { userId: cached.userId };
    }

    // Load from SQLite
    const row = this.statements.selectById.get(sessionId);

    if (!row || row.expires_at < Math.floor(Date.now() / 1000)) {
      if (row) {
        this.statements.deleteById.run(sessionId);
      }
      return null;
    }

    // Add to cache
    this.cache.set(sessionId, {
      userId: row.user_id,
      expiresAt: row.expires_at,
    });

    // Periodic cleanup
    this.requestCount++;
    if (this.requestCount >= this.cleanupInterval) {
      this.requestCount = 0;
      this.cleanup();
    }

    return { userId: row.user_id };
  }

  async delete(sessionId: string): Promise<void> {
    this.cache.delete(sessionId);
    this.statements.deleteById.run(sessionId);
  }

  private cleanup(): void {
    const now = Math.floor(Date.now() / 1000);
    this.statements.deleteExpired.run(now);
  }

  close(): void {
    try {
      this.db.run("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch {
      // ignore
    }
    this.db.close();
  }
}

export interface AuthCredentials {
  username: string;
  password: string;
}

export async function requireAuth(
  req: Request,
  db: AppDatabase,
  sessions: SessionStorage,
  requestedUsername?: string,
): Promise<User> {
  // Try session first — avoids bcrypt on every request
  const match = req.headers
    .get("Cookie")
    ?.match(/sessionid=([^;]+)/)
    ?.at(1);
  if (match) {
    const session = await sessions.get(match);
    if (session) {
      const user = db.first<User>(
        "SELECT id, name, password FROM users WHERE id = ?",
        session.userId,
      );
      if (user) {
        return checkAccess(user, requestedUsername);
      }
    }
  }

  // Fall back to Basic auth (bcrypt)
  const credentials = parseBasicAuth(req.headers.get("Authorization"));
  if (credentials) {
    const user = db.first<User>(
      "SELECT id, name, password FROM users WHERE name = ?",
      credentials.username,
    );

    if (user) {
      const verified = await Bun.password.verify(credentials.password, user.password);
      if (verified) {
        return checkAccess(user, requestedUsername);
      }
    }
  }

  throw unauthorized("Authentication required");
}

function parseBasicAuth(header: string | null): AuthCredentials | null {
  if (!header || !header.startsWith("Basic ")) {
    return null;
  }

  try {
    const decoded = atob(header.slice(6));
    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) {
      return null;
    }
    return {
      username: decoded.slice(0, colonIndex),
      password: decoded.slice(colonIndex + 1),
    };
  } catch {
    return null;
  }
}

function checkAccess(user: User, requestedUsername?: string): User {
  if (requestedUsername && requestedUsername !== "current" && requestedUsername !== user.name) {
    throw forbidden("Access denied");
  }
  return user;
}

export function createSessionCookie(sessionId: string, isSecure: boolean): string {
  let cookie = `sessionid=${sessionId}; HttpOnly; SameSite=Strict; Path=/`;
  if (isSecure) {
    cookie += "; Secure";
  }
  return cookie;
}

export function clearSessionCookie(isSecure: boolean): string {
  let cookie = "sessionid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0";
  if (isSecure) {
    cookie += "; Secure";
  }
  return cookie;
}
