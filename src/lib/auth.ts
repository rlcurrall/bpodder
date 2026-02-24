import type { DB } from "../db";

import { error } from "./response";

// User type returned by requireAuth
export interface User {
  id: number;
  name: string;
  password: string;
}

// LRU Cache for sessions
interface SessionEntry {
  userId: number;
  expiresAt: number;
}

class LRUCache {
  private cache = new Map<string, SessionEntry>();
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  get(key: string): SessionEntry | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, entry);
    }
    return entry;
  }

  set(key: string, value: SessionEntry): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }
}

export class SessionStore implements SessionStorage {
  private db: DB;
  private cache: LRUCache;
  private requestCount = 0;
  private readonly cleanupInterval = 100;

  constructor(db: DB, maxCacheSize = 1000) {
    this.db = db;
    this.cache = new LRUCache(maxCacheSize);
  }

  async create(userId: number): Promise<string> {
    const sessionId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 30 * 24 * 60 * 60; // 30 days

    // Write to SQLite
    this.db.run(
      "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
      sessionId,
      userId,
      now,
      expiresAt,
    );

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
        this.db.run("DELETE FROM sessions WHERE id = ?", sessionId);
        return null;
      }
      return { userId: cached.userId };
    }

    // Load from SQLite
    const row = this.db.first<{ user_id: number; expires_at: number }>(
      "SELECT user_id, expires_at FROM sessions WHERE id = ?",
      sessionId,
    );

    if (!row || row.expires_at < Math.floor(Date.now() / 1000)) {
      if (row) {
        this.db.run("DELETE FROM sessions WHERE id = ?", sessionId);
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
    this.db.run("DELETE FROM sessions WHERE id = ?", sessionId);
  }

  private cleanup(): void {
    const now = Math.floor(Date.now() / 1000);
    this.db.run("DELETE FROM sessions WHERE expires_at < ?", now);
  }

  // For graceful shutdown
  flush(): void {
    // Cache is write-through, so nothing to flush
  }
}

// Parse Basic auth header
interface AuthCredentials {
  username: string;
  password: string;
}

function parseBasicAuth(header: string): AuthCredentials | null {
  if (!header.startsWith("Basic ")) {
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

// Main auth function
export async function requireAuth(
  req: Request,
  db: AppDatabase,
  sessions: SessionStorage,
  requestedUsername?: string,
): Promise<User> {
  const authHeader = req.headers.get("Authorization");
  const cookieHeader = req.headers.get("Cookie");

  // Try to get session from cookie
  let sessionUserId: number | null = null;
  let sessionId: string | null = null;

  if (cookieHeader) {
    const match = cookieHeader.match(/sessionid=([^;]+)/);
    if (match) {
      sessionId = match[1];
      const session = await sessions.get(sessionId);
      if (session) {
        sessionUserId = session.userId;
      }
    }
  }

  // Try Basic auth
  let basicUser: User | null = null;

  if (authHeader) {
    const creds = parseBasicAuth(authHeader);
    if (creds) {
      // Standard Basic auth
      const user = db.first<User>(
        "SELECT id, name, password FROM users WHERE name = ?",
        creds.username,
      );

      if (user) {
        // Standard password verification
        const verified = await Bun.password.verify(creds.password, user.password);
        if (verified) {
          basicUser = user;
        }
      }
    }
  }

  // Determine authenticated user
  let authenticatedUser: User | null = null;

  if (basicUser) {
    authenticatedUser = basicUser;
  } else if (sessionUserId !== null) {
    // Load user from session
    const user = db.first<User>("SELECT id, name, password FROM users WHERE id = ?", sessionUserId);
    if (user) {
      authenticatedUser = user;
    }
  }

  if (!authenticatedUser) {
    throw error("Authentication required", 401);
  }

  // Check URL username access control
  if (requestedUsername && requestedUsername !== "current") {
    if (requestedUsername !== authenticatedUser.name) {
      throw error("Access denied", 403);
    }
  }

  return authenticatedUser;
}

// Generate session cookie header
export function createSessionCookie(sessionId: string, isSecure: boolean): string {
  let cookie = `sessionid=${sessionId}; HttpOnly; SameSite=Strict; Path=/`;
  if (isSecure) {
    cookie += "; Secure";
  }
  return cookie;
}

// Clear session cookie
export function clearSessionCookie(isSecure: boolean): string {
  let cookie = "sessionid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0";
  if (isSecure) {
    cookie += "; Secure";
  }
  return cookie;
}
