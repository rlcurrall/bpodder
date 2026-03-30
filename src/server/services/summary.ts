import type { EpisodeActionWithIdType } from "@shared/schemas/episodes";
import type { SummaryResponseType } from "@shared/schemas/summary";

const RECENT_EPISODES_LIMIT = 10;

export async function getUserSummary(
  db: AppDatabase,
  userId: number,
): Promise<SummaryResponseType> {
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

  const recentEpisodes: EpisodeActionWithIdType[] = recentRows.map((row) => {
    const action: EpisodeActionWithIdType = {
      id: row.id,
      podcast: row.podcast ?? "",
      episode: row.episode,
      action: row.action,
      timestamp: formatTimestamp(row.timestamp),
    };

    if (row.position !== null) action.position = row.position;
    if (row.started !== null) action.started = row.started;
    if (row.total !== null) action.total = row.total;
    if (row.device) action.device = row.device;

    if (row.data) {
      try {
        const data = JSON.parse(row.data);
        Object.assign(action, data);
      } catch {
        // ignore
      }
    }

    return action;
  });

  return {
    device_count: deviceCountRow?.count ?? 0,
    subscription_count: subscriptionCountRow?.count ?? 0,
    recent_episodes: recentEpisodes,
  };
}

function formatTimestamp(unix: number): string {
  return new Date(unix * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}
