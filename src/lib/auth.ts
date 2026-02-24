import type { DB } from "../db";
import { error } from "./response";

// User type returned by requireAuth
export interface User {
  id: number;
  name: string;
  password: string;
  token: string | null;
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

export class SessionStore {
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
      expiresAt
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
      sessionId
    );

    if (!row || row.expires_at < Math.floor(Date.now() / 1000)) {
      if (row) {
        this.db.run("DELETE FROM sessions WHERE id = ?", sessionId);
      }
      return null;
    }

    // Add to cache
    this.cache.set(sessionId, { userId: row.user_id, expiresAt: row.expires_at });

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

// Poll token storage for NextCloud Login v2
export class PollTokenStore {
  private db: DB;

  constructor(db: DB) {
    this.db = db;
  }

  async create(baseUrl: string): Promise<{ token: string; loginUrl: string }> {
    const token = crypto.randomUUID();
    const tokenHash = await hashToken(token);
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 20 * 60; // 20 minutes

    this.db.run(
      "INSERT INTO poll_tokens (token_hash, user_id, created_at, expires_at, attempts) VALUES (?, NULL, ?, ?, 0)",
      tokenHash,
      now,
      expiresAt
    );

    return { token, loginUrl: `${baseUrl}/login?token=${encodeURIComponent(token)}` };
  }

  async poll(token: string): Promise<{ userId: number; loginName: string; appPassword: string } | null> {
    const tokenHash = await hashToken(token);
    const now = Math.floor(Date.now() / 1000);

    const row = this.db.first<{
      user_id: number | null;
      expires_at: number;
      attempts: number;
    }>(
      "SELECT user_id, expires_at, attempts FROM poll_tokens WHERE token_hash = ?",
      tokenHash
    );

    if (!row) {
      return null;
    }

    if (row.expires_at < now) {
      this.db.run("DELETE FROM poll_tokens WHERE token_hash = ?", tokenHash);
      return null;
    }

    if (row.user_id === null) {
      // Not yet authenticated
      const newAttempts = row.attempts + 1;
      if (newAttempts >= 10) {
        this.db.run("DELETE FROM poll_tokens WHERE token_hash = ?", tokenHash);
      } else {
        this.db.run(
          "UPDATE poll_tokens SET attempts = ? WHERE token_hash = ?",
          newAttempts,
          tokenHash
        );
      }
      return null;
    }

    // User authenticated, generate app password
    const user = this.db.first<{ name: string; password: string }>(
      "SELECT name, password FROM users WHERE id = ?",
      row.user_id
    );

    if (!user) {
      return null;
    }

    // Delete token (single-use)
    this.db.run("DELETE FROM poll_tokens WHERE token_hash = ?", tokenHash);

    // Generate app password: token:sha1(user_password_hash + token)
    const encoder = new TextEncoder();
    const data = encoder.encode(user.password + token);
    const hashBuffer = await crypto.subtle.digest("SHA-1", data);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const appPassword = `${token}:${hashHex}`;

    return { userId: row.user_id, loginName: user.name, appPassword };
  }

  async authenticateToken(token: string, userId: number): Promise<boolean> {
    const tokenHash = await hashToken(token);
    const row = this.db.first<{ expires_at: number }>(
      "SELECT expires_at FROM poll_tokens WHERE token_hash = ?",
      tokenHash
    );

    if (!row || row.expires_at < Math.floor(Date.now() / 1000)) {
      return false;
    }

    // Only update user_id if it's a valid user (userId > 0)
    if (userId > 0) {
      this.db.run(
        "UPDATE poll_tokens SET user_id = ? WHERE token_hash = ?",
        userId,
        tokenHash
      );
    }
    return true;
  }
}

export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

// Verify NextCloud app password
async function verifyAppPassword(
  user: User,
  providedPassword: string
): Promise<boolean> {
  // Format: token:sha1(user_password_hash + token)
  const parts = providedPassword.split(":");
  if (parts.length !== 2) return false;

  const [token, providedHash] = parts;
  const encoder = new TextEncoder();
  const data = encoder.encode(user.password + token);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const computedHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computedHash === providedHash.toLowerCase();
}

// Main auth function
export async function requireAuth(
  req: Request,
  db: DB,
  sessions: SessionStore,
  requestedUsername?: string
): Promise<User> {
  const url = new URL(req.url);
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

  // Try token auth or Basic auth
  let basicUser: User | null = null;

  if (authHeader) {
    const creds = parseBasicAuth(authHeader);
    if (creds) {
      // Check for token auth format: username__token
      const tokenMatch = creds.username.match(/^(.+)__(.+)$/);
      if (tokenMatch) {
        const [, username, token] = tokenMatch;
        const user = db.first<User>(
          "SELECT id, name, password, token FROM users WHERE name = ?",
          username
        );

        if (user && user.token === token) {
          basicUser = user;
        }
      } else {
        // Standard Basic auth
        const user = db.first<User>(
          "SELECT id, name, password, token FROM users WHERE name = ?",
          creds.username
        );

        if (user) {
          // Try app password format first (NextCloud)
          const isAppPassword = creds.password.includes(":");
          if (isAppPassword) {
            if (await verifyAppPassword(user, creds.password)) {
              basicUser = user;
            }
          } else {
            // Standard password verification
            const verified = await Bun.password.verify(creds.password, user.password);
            if (verified) {
              basicUser = user;
            }
          }
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
    const user = db.first<User>(
      "SELECT id, name, password, token FROM users WHERE id = ?",
      sessionUserId
    );
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
