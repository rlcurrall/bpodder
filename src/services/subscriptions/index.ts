import type {
  ListSubscriptionsOptions,
  SubscriptionDelta,
  SubscriptionDeviceRow,
  SubscriptionFeedRow,
  SubscriptionPage,
  SubscriptionPageCursor,
  SubscriptionSortBy,
  SubscriptionSortDir,
  SyncSubscriptionDeltaResult,
  UrlRewrite,
} from "./types";

export type { SubscriptionSortBy, SubscriptionSortDir } from "./types";

import { isHttpUrl } from "@shared/schemas/index";

import { AppError } from "../../lib/errors";

export async function listSubscriptionsPaginated(
  db: AppDatabase,
  options: ListSubscriptionsOptions,
): Promise<SubscriptionPage> {
  const { userId, deviceId, limit, cursor, q, sortBy, sortDir } = options;

  if (deviceId === undefined) {
    return listAllDevicesSubscriptions(db, userId, limit, cursor, q, sortBy, sortDir);
  }

  return listDeviceSubscriptions(db, userId, deviceId, limit, cursor, q, sortBy, sortDir);
}

function getSortSpec(sortBy: SubscriptionSortBy, sortDir: SubscriptionSortDir) {
  const compareOp = sortDir === "asc" ? ">" : "<";
  const orderDir = sortDir.toUpperCase();

  switch (sortBy) {
    case "title":
      return {
        selectExpr: "LOWER(COALESCE(f.title, s.url))",
        selectExprAllDevices: "LOWER(COALESCE(f2.title, s2.url))",
        compareOp,
        orderDir,
      };
    case "url":
      return {
        selectExpr: "LOWER(s.url)",
        selectExprAllDevices: "LOWER(s2.url)",
        compareOp,
        orderDir,
      };
    case "changed":
    default:
      return {
        selectExpr: "s.changed",
        selectExprAllDevices: "s2.changed",
        compareOp,
        orderDir,
      };
  }
}

async function listAllDevicesSubscriptions(
  db: AppDatabase,
  userId: number,
  limit: number,
  cursor: SubscriptionPageCursor | null,
  q?: string,
  sortBy: SubscriptionSortBy = "changed",
  sortDir: SubscriptionSortDir = "desc",
): Promise<SubscriptionPage> {
  const sortSpec = getSortSpec(sortBy, sortDir);
  let cursorClause = "";
  let filterClause = "";
  const filterParams: (string | number)[] = [];
  const cursorParams: (string | number)[] = [];

  if (cursor) {
    cursorClause = `AND (sort_primary ${sortSpec.compareOp} ? OR (sort_primary = ? AND rn_id ${sortSpec.compareOp} ?))`;
    cursorParams.push(cursor.primary, cursor.primary, cursor.id);
  }

  if (q) {
    filterClause = " AND (LOWER(s2.url) LIKE ? OR LOWER(COALESCE(f2.title, '')) LIKE ?)";
    const pattern = `%${q.toLowerCase()}%`;
    filterParams.push(pattern, pattern);
  }

  const rows = db.all<{
    url: string;
    title: string | null;
    image_url: string | null;
    sort_primary: number | string;
    rn_id: number;
  }>(
    `SELECT url, title, image_url, sort_primary, rn_id
     FROM (
       SELECT
         s2.url AS url,
          f2.title AS title,
          f2.image_url AS image_url,
          ${sortSpec.selectExprAllDevices} AS sort_primary,
          s2.id AS rn_id,
          ROW_NUMBER() OVER (PARTITION BY s2.url ORDER BY s2.changed DESC, s2.id DESC) AS rn
       FROM subscriptions s2
       LEFT JOIN feeds f2 ON s2.feed = f2.id
       WHERE s2.user = ? AND s2.deleted = 0${filterClause}
     )
     WHERE rn = 1 ${cursorClause}
     ORDER BY sort_primary ${sortSpec.orderDir}, rn_id ${sortSpec.orderDir}
     LIMIT ?`,
    userId,
    ...filterParams,
    ...cursorParams,
    limit + 1,
  );

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, -1) : rows;

  let totalFilterClause = "";
  if (q) {
    totalFilterClause = " AND (LOWER(s2.url) LIKE ? OR LOWER(COALESCE(f2.title, '')) LIKE ?)";
  }

  const totalCountRow = db.first<{ total: number }>(
    `SELECT COUNT(*) AS total FROM (
       SELECT s2.url
       FROM subscriptions s2
       LEFT JOIN feeds f2 ON s2.feed = f2.id
       WHERE s2.user = ? AND s2.deleted = 0${totalFilterClause}
       GROUP BY s2.url
     ) AS unique_urls`,
    userId,
    ...filterParams,
  );

  let nextCursor: SubscriptionPageCursor | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    nextCursor = {
      sortBy,
      sortDir,
      primary: last.sort_primary,
      id: last.rn_id,
    };
  }

  return {
    items: items.map((row) => ({
      url: row.url,
      title: row.title,
      imageUrl: row.image_url,
    })),
    nextCursor,
    totalCount: totalCountRow?.total ?? 0,
  };
}

async function listDeviceSubscriptions(
  db: AppDatabase,
  userId: number,
  deviceId: number,
  limit: number,
  cursor: SubscriptionPageCursor | null,
  q?: string,
  sortBy: SubscriptionSortBy = "changed",
  sortDir: SubscriptionSortDir = "desc",
): Promise<SubscriptionPage> {
  const sortSpec = getSortSpec(sortBy, sortDir);
  let cursorClause = "";
  let filterClause = "";
  const filterParams: (string | number)[] = [];
  const cursorParams: (string | number)[] = [];

  if (cursor) {
    cursorClause = `AND ((${sortSpec.selectExpr}) ${sortSpec.compareOp} ? OR ((${sortSpec.selectExpr}) = ? AND s.id ${sortSpec.compareOp} ?))`;
    cursorParams.push(cursor.primary, cursor.primary, cursor.id);
  }

  if (q) {
    filterClause = " AND (LOWER(s.url) LIKE ? OR LOWER(COALESCE(f.title, '')) LIKE ?)";
    const pattern = `%${q.toLowerCase()}%`;
    filterParams.push(pattern, pattern);
  }

  const rows = db.all<{
    url: string;
    title: string | null;
    image_url: string | null;
    sort_primary: number | string;
    id: number;
  }>(
    `SELECT s.url, f.title, f.image_url, ${sortSpec.selectExpr} AS sort_primary, s.id
     FROM subscriptions s
     LEFT JOIN feeds f ON s.feed = f.id
     WHERE s.user = ? AND s.device = ? AND s.deleted = 0${filterClause}
     ${cursorClause}
     ORDER BY sort_primary ${sortSpec.orderDir}, s.id ${sortSpec.orderDir}
     LIMIT ?`,
    userId,
    deviceId,
    ...filterParams,
    ...cursorParams,
    limit + 1,
  );

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, -1) : rows;

  let totalFilterClause = "";
  if (q) {
    totalFilterClause = " AND (LOWER(s.url) LIKE ? OR LOWER(COALESCE(f.title, '')) LIKE ?)";
  }

  const totalCountRow = db.first<{ total: number }>(
    `SELECT COUNT(*) AS total
     FROM subscriptions s
     LEFT JOIN feeds f ON s.feed = f.id
     WHERE s.user = ? AND s.device = ? AND s.deleted = 0${totalFilterClause}`,
    userId,
    deviceId,
    ...filterParams,
  );

  let nextCursor: SubscriptionPageCursor | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    nextCursor = {
      sortBy,
      sortDir,
      primary: last.sort_primary,
      id: last.id,
    };
  }

  return {
    items: items.map((row) => ({
      url: row.url,
      title: row.title,
      imageUrl: row.image_url,
    })),
    nextCursor,
    totalCount: totalCountRow?.total ?? 0,
  };
}

// ============================================================================
// Device Management for Subscription Flows
// ============================================================================

export function ensureSubscriptionDevice(
  db: AppDatabase,
  options: { userId: number; deviceId: string },
): number {
  const { userId, deviceId } = options;

  db.run(
    `INSERT INTO devices (user, deviceid, caption, type, data)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user, deviceid) DO NOTHING`,
    userId,
    deviceId,
    null,
    "other",
    null,
  );

  const device = db.first<{ id: number }>(
    "SELECT id FROM devices WHERE user = ? AND deviceid = ?",
    userId,
    deviceId,
  );

  return device!.id;
}

export function findSubscriptionDevice(
  db: AppDatabase,
  options: { userId: number; deviceId: string },
): SubscriptionDeviceRow | null {
  const { userId, deviceId } = options;

  return (
    db.first<SubscriptionDeviceRow>(
      "SELECT id FROM devices WHERE user = ? AND deviceid = ?",
      userId,
      deviceId,
    ) ?? null
  );
}

// ============================================================================
// Delta Sync Operations
// ============================================================================

export function getSubscriptionDelta(
  db: AppDatabase,
  options: { userId: number; devicePk: number; since: number },
): SubscriptionDelta {
  const { userId, devicePk, since } = options;

  const subs = db.all<{
    url: string;
    deleted: number;
    changed: number;
  }>(
    "SELECT url, deleted, changed FROM subscriptions WHERE user = ? AND device = ? AND changed >= ?",
    userId,
    devicePk,
    since,
  );

  const add: string[] = [];
  const remove: string[] = [];

  for (const sub of subs) {
    if (sub.deleted) {
      remove.push(sub.url);
    } else {
      add.push(sub.url);
    }
  }

  return { add, remove };
}

function sanitizeUrl(url: string): { url: string; modified: boolean } {
  const trimmed = url.trim();
  return { url: trimmed, modified: trimmed !== url };
}

export function syncSubscriptionDelta(
  db: AppDatabase,
  options: {
    userId: number;
    devicePk: number;
    add: string[];
    remove: string[];
    timestamp: number;
  },
): SyncSubscriptionDeltaResult {
  const { userId, devicePk, add: addList, remove: removeList, timestamp } = options;

  const addedUrls = new Set(addList);
  for (const url of removeList) {
    if (addedUrls.has(url)) {
      throw new AppError("subscriptions.url_in_both_add_and_remove");
    }
  }

  const rewrites: UrlRewrite[] = [];
  const addedFetchUrls: string[] = [];

  db.transaction(() => {
    for (const u of addList) {
      const sanitized = sanitizeUrl(u);
      if (sanitized.modified) {
        rewrites.push({ from: u, to: sanitized.url });
      }

      if (!isHttpUrl(sanitized.url)) {
        rewrites.push({ from: sanitized.url, to: "" });
        continue;
      }

      const existing = db.first<{ id: number; deleted: number }>(
        "SELECT id, deleted FROM subscriptions WHERE user = ? AND device = ? AND url = ?",
        userId,
        devicePk,
        sanitized.url,
      );

      if (existing) {
        if (existing.deleted) {
          db.run(
            "UPDATE subscriptions SET deleted = 0, changed = ? WHERE id = ?",
            timestamp,
            existing.id,
          );
        } else {
          db.run("UPDATE subscriptions SET changed = ? WHERE id = ?", timestamp, existing.id);
        }
      } else {
        db.run(
          "INSERT INTO subscriptions (user, device, feed, url, deleted, changed, data) VALUES (?, ?, NULL, ?, 0, ?, NULL)",
          userId,
          devicePk,
          sanitized.url,
          timestamp,
        );
      }

      addedFetchUrls.push(sanitized.url);
    }

    for (const u of removeList) {
      const sanitized = sanitizeUrl(u);
      if (sanitized.modified) {
        rewrites.push({ from: u, to: sanitized.url });
      }

      if (!isHttpUrl(sanitized.url)) {
        rewrites.push({ from: sanitized.url, to: "" });
        continue;
      }

      db.run(
        "UPDATE subscriptions SET deleted = 1, changed = ? WHERE user = ? AND device = ? AND url = ?",
        timestamp,
        userId,
        devicePk,
        sanitized.url,
      );
    }
  });

  return { timestamp, rewrites, addedFetchUrls };
}

// ============================================================================
// Additive Subscription Operations
// ============================================================================

export function addDeviceSubscriptions(
  db: AppDatabase,
  options: {
    userId: number;
    devicePk: number;
    urls: string[];
    timestamp: number;
  },
): string[] {
  const { userId, devicePk, urls, timestamp } = options;
  const acceptedUrls: string[] = [];

  db.transaction(() => {
    for (const url of urls) {
      if (!isHttpUrl(url)) continue;

      const existing = db.first<{ id: number; deleted: number }>(
        "SELECT id, deleted FROM subscriptions WHERE user = ? AND device = ? AND url = ?",
        userId,
        devicePk,
        url,
      );

      if (existing) {
        if (existing.deleted) {
          db.run(
            "UPDATE subscriptions SET deleted = 0, changed = ? WHERE id = ?",
            timestamp,
            existing.id,
          );
        } else {
          db.run("UPDATE subscriptions SET changed = ? WHERE id = ?", timestamp, existing.id);
        }
      } else {
        db.run(
          "INSERT INTO subscriptions (user, device, feed, url, deleted, changed, data) VALUES (?, ?, NULL, ?, 0, ?, NULL)",
          userId,
          devicePk,
          url,
          timestamp,
        );
      }

      acceptedUrls.push(url);
    }
  });

  return acceptedUrls;
}

// ============================================================================
// List Query Functions
// ============================================================================

export function listUserSubscriptionUrls(db: AppDatabase, userId: number): string[] {
  const subs = db.all<{ url: string }>(
    "SELECT DISTINCT url FROM subscriptions WHERE user = ? AND deleted = 0",
    userId,
  );

  return subs.map((s) => s.url);
}

export function listDeviceSubscriptionUrls(
  db: AppDatabase,
  options: { userId: number; devicePk: number },
): string[] {
  const { userId, devicePk } = options;

  const subs = db.all<{ url: string }>(
    "SELECT url FROM subscriptions WHERE user = ? AND device = ? AND deleted = 0",
    userId,
    devicePk,
  );

  return subs.map((s) => s.url);
}

export function listUserSubscriptionFeedRows(
  db: AppDatabase,
  userId: number,
): SubscriptionFeedRow[] {
  return db.all<SubscriptionFeedRow>(
    "SELECT url, data FROM subscriptions WHERE user = ? AND deleted = 0",
    userId,
  );
}

export function listDeviceSubscriptionFeedRows(
  db: AppDatabase,
  options: { userId: number; devicePk: number },
): SubscriptionFeedRow[] {
  const { userId, devicePk } = options;

  return db.all<SubscriptionFeedRow>(
    "SELECT url, data FROM subscriptions WHERE user = ? AND device = ? AND deleted = 0",
    userId,
    devicePk,
  );
}
