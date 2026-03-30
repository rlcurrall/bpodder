import type { EpisodeActionWithIdType } from "@shared/schemas/episodes";
import type { CursorType } from "@shared/schemas/pagination";
import type { PaginatedResponseType } from "@shared/schemas/pagination";

import { encodeCursor } from "../lib/pagination";

export interface ListEpisodeActionsOptions {
  userId: number;
  limit: number;
  cursor: CursorType | null;
  podcast?: string;
  device?: string;
  action?: string;
}

export async function listEpisodeActionsPaginated(
  db: AppDatabase,
  options: ListEpisodeActionsOptions,
): Promise<PaginatedResponseType<EpisodeActionWithIdType>> {
  const { userId, limit, cursor, podcast, device, action } = options;

  const params: (string | number)[] = [userId];
  let cursorClause = "";
  let filterClause = "";

  // Cursor pagination: uploaded_at DESC, id DESC
  if (cursor) {
    cursorClause = `AND (ea.uploaded_at < ? OR (ea.uploaded_at = ? AND ea.id < ?))`;
    params.push(cursor.primary, cursor.primary, cursor.id);
  }

  // Filters
  if (podcast) {
    filterClause += " AND s.url = ?";
    params.push(podcast);
  }
  if (device) {
    filterClause += " AND d.deviceid = ?";
    params.push(device);
  }
  if (action) {
    filterClause += " AND ea.action = ?";
    params.push(action);
  }

  const rows = db.all<{
    id: number;
    episode: string;
    action: string;
    timestamp: number;
    position: number | null;
    started: number | null;
    total: number | null;
    data: string | null;
    podcast: string | null;
    device: string | null;
    uploaded_at: number;
  }>(
    `SELECT
      ea.id,
      ea.url as episode,
      ea.action,
      ea.changed as timestamp,
      ea.position,
      ea.started,
      ea.total,
      ea.data,
      s.url as podcast,
      d.deviceid as device,
      ea.uploaded_at
    FROM episodes_actions ea
    LEFT JOIN subscriptions s ON ea.subscription = s.id
    LEFT JOIN devices d ON ea.device = d.id
    WHERE ea.user = ? ${cursorClause} ${filterClause}
    ORDER BY ea.uploaded_at DESC, ea.id DESC
    LIMIT ?`,
    ...params,
    limit + 1,
  );

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, -1) : rows;

  // Get total count (without cursor/limit)
  const totalCountParams: (string | number)[] = [userId];
  let totalFilterClause = "";
  if (podcast) {
    totalFilterClause += " AND s.url = ?";
    totalCountParams.push(podcast);
  }
  if (device) {
    totalFilterClause += " AND d.deviceid = ?";
    totalCountParams.push(device);
  }
  if (action) {
    totalFilterClause += " AND ea.action = ?";
    totalCountParams.push(action);
  }

  const totalCountRow = db.first<{ total: number }>(
    `SELECT COUNT(*) AS total
    FROM episodes_actions ea
    LEFT JOIN subscriptions s ON ea.subscription = s.id
    LEFT JOIN devices d ON ea.device = d.id
    WHERE ea.user = ? ${totalFilterClause}`,
    ...totalCountParams,
  );

  // Build next cursor
  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    nextCursor = encodeCursor(last.uploaded_at, last.id);
  }

  // Map to response shape
  const mappedItems: EpisodeActionWithIdType[] = items.map((row) => {
    const actionItem: EpisodeActionWithIdType = {
      id: row.id,
      podcast: row.podcast ?? "",
      episode: row.episode,
      action: row.action,
      timestamp: formatTimestamp(row.timestamp),
    };

    if (row.position !== null) actionItem.position = row.position;
    if (row.started !== null) actionItem.started = row.started;
    if (row.total !== null) actionItem.total = row.total;
    if (row.device) actionItem.device = row.device;

    if (row.data) {
      try {
        const data = JSON.parse(row.data);
        Object.assign(actionItem, data);
      } catch {
        // ignore
      }
    }

    return actionItem;
  });

  return {
    items: mappedItems,
    page: {
      next_cursor: nextCursor,
      total_count: totalCountRow?.total ?? 0,
    },
  };
}

function formatTimestamp(unix: number): string {
  return new Date(unix * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}
