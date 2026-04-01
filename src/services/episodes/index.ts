import type {
  EpisodeActionPage,
  EpisodeActionRecord,
  ListEpisodeActionsOptions,
  ListEpisodeActionsSinceOptions,
  RecordEpisodeActionsCommand,
  RecordEpisodeActionsResult,
  UrlRewrite,
} from "./types";

export function listEpisodeActionsSince(
  db: AppDatabase,
  options: ListEpisodeActionsSinceOptions,
): EpisodeActionRecord[] {
  const { userId, since, podcast, device, aggregated } = options;

  let sql: string;
  const params: (string | number)[] = [userId, since];

  if (aggregated) {
    let filters = "";
    if (podcast) {
      filters += " AND s.url = ?";
      params.push(podcast);
    }
    if (device) {
      filters += " AND d.deviceid = ?";
      params.push(device);
    }

    sql = `
      SELECT * FROM (
        SELECT
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
          ROW_NUMBER() OVER (PARTITION BY ea.url ORDER BY ea.changed DESC, ea.id DESC) as rn
        FROM episodes_actions ea
        LEFT JOIN subscriptions s ON ea.subscription = s.id
        LEFT JOIN devices d ON ea.device = d.id
        WHERE ea.user = ? AND ea.uploaded_at >= ?
        ${filters}
      ) WHERE rn = 1
      ORDER BY timestamp
    `;
  } else {
    sql = `
      SELECT
        ea.id,
        ea.url as episode,
        ea.action,
        ea.changed as timestamp,
        ea.position,
        ea.started,
        ea.total,
        ea.data,
        s.url as podcast,
        d.deviceid as device
      FROM episodes_actions ea
      LEFT JOIN subscriptions s ON ea.subscription = s.id
      LEFT JOIN devices d ON ea.device = d.id
      WHERE ea.user = ? AND ea.uploaded_at >= ?
    `;

    if (podcast) {
      sql += " AND s.url = ?";
      params.push(podcast);
    }
    if (device) {
      sql += " AND d.deviceid = ?";
      params.push(device);
    }

    sql += " ORDER BY ea.changed";
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
  }>(sql, ...params);

  return rows.map((row) => buildEpisodeActionRecord(row));
}

export function recordEpisodeActions(
  db: AppDatabase,
  command: RecordEpisodeActionsCommand,
): RecordEpisodeActionsResult {
  const { userId, receivedAtUnix, actions } = command;
  const rewrites: UrlRewrite[] = [];

  db.transaction(() => {
    for (const action of actions) {
      // Sanitize URLs - trim whitespace and track rewrites
      const sanitizedPodcast = action.podcastUrl.trim();
      const sanitizedEpisode = action.episodeUrl.trim();

      if (sanitizedPodcast !== action.podcastUrl) {
        rewrites.push({ from: action.podcastUrl, to: sanitizedPodcast });
      }
      if (sanitizedEpisode !== action.episodeUrl) {
        rewrites.push({ from: action.episodeUrl, to: sanitizedEpisode });
      }

      // Look up subscription across all devices (for reuse)
      let subscription = db.first<{ id: number; device: number }>(
        "SELECT id, device FROM subscriptions WHERE user = ? AND url = ? AND deleted = 0",
        userId,
        sanitizedPodcast,
      );

      let subscriptionDeviceId: number | null = null;

      if (action.deviceId) {
        const device = db.first<{ id: number }>(
          "SELECT id FROM devices WHERE user = ? AND deviceid = ?",
          userId,
          action.deviceId,
        );
        if (device) {
          subscriptionDeviceId = device.id;
        }
      }

      if (!subscription) {
        let devicePk = subscriptionDeviceId;

        if (!devicePk) {
          let defaultDevice = db.first<{ id: number }>(
            "SELECT id FROM devices WHERE user = ? ORDER BY id LIMIT 1",
            userId,
          );

          if (!defaultDevice) {
            db.run(
              "INSERT INTO devices (user, deviceid, caption, type, data) VALUES (?, ?, ?, ?, NULL)",
              userId,
              "_default",
              "Default Device",
              "other",
            );
            defaultDevice = db.first<{ id: number }>(
              "SELECT id FROM devices WHERE user = ? AND deviceid = ?",
              userId,
              "_default",
            );
          }

          devicePk = defaultDevice!.id;
        }

        db.run(
          "INSERT INTO subscriptions (user, device, feed, url, deleted, changed, data) VALUES (?, ?, NULL, ?, 0, ?, NULL)",
          userId,
          devicePk,
          sanitizedPodcast,
          receivedAtUnix,
        );
        subscription = db.first<{ id: number; device: number }>(
          "SELECT id, device FROM subscriptions WHERE user = ? AND device = ? AND url = ? AND deleted = 0",
          userId,
          devicePk,
          sanitizedPodcast,
        );
      }

      let actionDeviceId: number | null = subscriptionDeviceId;
      if (!actionDeviceId && subscription) {
        actionDeviceId = subscription.device;
      }

      const metadataJson = JSON.stringify(action.metadata ?? {});

      db.run(
        `INSERT INTO episodes_actions
            (user, subscription, episode, device, url, changed, uploaded_at, action, position, started, total, data)
            VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        userId,
        subscription?.id ?? null,
        actionDeviceId,
        sanitizedEpisode,
        action.occurredAtUnix ?? receivedAtUnix,
        receivedAtUnix,
        action.kind,
        action.position ?? null,
        action.started ?? null,
        action.total ?? null,
        metadataJson,
      );
    }
  });

  return { rewrites };
}

export async function listEpisodeActionsPaginated(
  db: AppDatabase,
  options: ListEpisodeActionsOptions,
): Promise<EpisodeActionPage> {
  const { userId, limit, cursor, podcast, device, action } = options;

  const params: (string | number)[] = [userId];
  let cursorClause = "";
  let filterClause = "";

  if (cursor) {
    cursorClause = `AND (ea.uploaded_at < ? OR (ea.uploaded_at = ? AND ea.id < ?))`;
    params.push(cursor.primary, cursor.primary, cursor.id);
  }

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

  let nextCursor: { primary: number; id: number } | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    nextCursor = {
      primary: last.uploaded_at,
      id: last.id,
    };
  }

  return {
    items: items.map((row) => buildEpisodeActionRecord(row)),
    nextCursor,
    totalCount: totalCountRow?.total ?? 0,
  };
}

function buildEpisodeActionRecord(row: {
  id?: number;
  episode: string;
  action: string;
  timestamp: number;
  position: number | null;
  started: number | null;
  total: number | null;
  data: string | null;
  podcast: string | null;
  device: string | null;
}): EpisodeActionRecord {
  return {
    id: row.id,
    podcastUrl: row.podcast,
    episodeUrl: row.episode,
    kind: row.action,
    occurredAtUnix: row.timestamp,
    position: row.position,
    started: row.started,
    total: row.total,
    deviceId: row.device,
    metadata: parseEpisodeActionMetadata(row.data),
  };
}

function parseEpisodeActionMetadata(data: string | null): Record<string, unknown> | null {
  if (!data) {
    return null;
  }

  try {
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
