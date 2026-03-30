import type { PaginatedResponseType } from "@shared/schemas/pagination";
import type {
  SubscriptionCursorType,
  SubscriptionSortByType,
  SubscriptionSortDirType,
} from "@shared/schemas/subscriptions";

import { encodeSubscriptionCursor, SubscriptionCursorError } from "../lib/subscription-pagination";

export { SubscriptionCursorError };

export interface ListSubscriptionsOptions {
  userId: number;
  deviceId?: number;
  limit: number;
  cursor: SubscriptionCursorType | null;
  q?: string;
  sortBy: SubscriptionSortByType;
  sortDir: SubscriptionSortDirType;
}

export interface SubscriptionRow {
  url: string;
  title: string | null;
  image_url: string | null;
}

export async function listSubscriptionsPaginated(
  db: AppDatabase,
  options: ListSubscriptionsOptions,
): Promise<PaginatedResponseType<SubscriptionRow>> {
  const { userId, deviceId, limit, cursor, q, sortBy, sortDir } = options;

  if (deviceId === undefined) {
    return listAllDevicesSubscriptions(db, userId, limit, cursor, q, sortBy, sortDir);
  }

  return listDeviceSubscriptions(db, userId, deviceId, limit, cursor, q, sortBy, sortDir);
}

function getSortSpec(sortBy: SubscriptionSortByType, sortDir: SubscriptionSortDirType) {
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
  cursor: SubscriptionCursorType | null,
  q?: string,
  sortBy: SubscriptionSortByType = "changed",
  sortDir: SubscriptionSortDirType = "desc",
): Promise<PaginatedResponseType<SubscriptionRow>> {
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
  const items: Array<{
    url: string;
    title: string | null;
    image_url: string | null;
    sort_primary: number | string;
    rn_id: number;
  }> = hasMore ? rows.slice(0, -1) : rows;

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

  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    nextCursor = encodeSubscriptionCursor(sortBy, sortDir, last.sort_primary, last.rn_id);
  }

  return {
    items: items.map((row) => ({
      url: row.url,
      title: row.title,
      image_url: row.image_url,
    })),
    page: {
      next_cursor: nextCursor,
      total_count: totalCountRow?.total ?? 0,
    },
  };
}

async function listDeviceSubscriptions(
  db: AppDatabase,
  userId: number,
  deviceId: number,
  limit: number,
  cursor: SubscriptionCursorType | null,
  q?: string,
  sortBy: SubscriptionSortByType = "changed",
  sortDir: SubscriptionSortDirType = "desc",
): Promise<PaginatedResponseType<SubscriptionRow>> {
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
  const items: Array<{
    url: string;
    title: string | null;
    image_url: string | null;
    sort_primary: number | string;
    id: number;
  }> = hasMore ? rows.slice(0, -1) : rows;

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

  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    nextCursor = encodeSubscriptionCursor(sortBy, sortDir, last.sort_primary, last.id);
  }

  return {
    items: items.map((row) => ({
      url: row.url,
      title: row.title,
      image_url: row.image_url,
    })),
    page: {
      next_cursor: nextCursor,
      total_count: totalCountRow?.total ?? 0,
    },
  };
}
