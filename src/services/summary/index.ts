import type { EpisodeActionRecord } from "@services/episodes/types";

import type { UserSummary } from "./types";

const RECENT_EPISODES_LIMIT = 10;

export async function getUserSummary(db: AppDatabase, userId: number): Promise<UserSummary> {
  // Device count
  const deviceCountRow = db.first<{ count: number }>(
    "SELECT COUNT(*) AS count FROM devices WHERE user = ?",
    userId,
  );

  // Subscription count (unique URLs across all devices)
  const subscriptionCountRow = db.first<{ count: number }>(
    `SELECT COUNT(DISTINCT url) AS count FROM subscriptions WHERE user = ? AND deleted = 0`,
    userId,
  );

  // Recent episodes (last 10 actions)
  const recentRows = db.all<{
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
      d.deviceid as device
    FROM episodes_actions ea
    LEFT JOIN subscriptions s ON ea.subscription = s.id
    LEFT JOIN devices d ON ea.device = d.id
    WHERE ea.user = ?
    ORDER BY ea.uploaded_at DESC, ea.id DESC
    LIMIT ?`,
    userId,
    RECENT_EPISODES_LIMIT,
  );

  const recentEpisodes: Array<EpisodeActionRecord & { id: number }> = recentRows.map((row) => ({
    id: row.id,
    podcastUrl: row.podcast,
    episodeUrl: row.episode,
    kind: row.action,
    occurredAtUnix: row.timestamp,
    position: row.position,
    started: row.started,
    total: row.total,
    deviceId: row.device,
    metadata: parseMetadata(row.data),
  }));

  return {
    deviceCount: deviceCountRow?.count ?? 0,
    subscriptionCount: subscriptionCountRow?.count ?? 0,
    recentEpisodes,
  };
}

function parseMetadata(data: string | null): Record<string, unknown> | null {
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
