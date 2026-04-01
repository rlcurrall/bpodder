import type { EpisodeActionRecord, EpisodeActionPage } from "@services/episodes/types";
import type {
  EpisodeActionResponseType,
  EpisodeActionWithIdType,
  EpisodeUploadResponseType,
} from "@shared/schemas/episodes";
import type { PaginatedResponseType } from "@shared/schemas/pagination";

import { encodeCursor } from "@server/lib/pagination";

export function toEpisodeActionResponse(record: EpisodeActionRecord): EpisodeActionResponseType {
  const action: EpisodeActionResponseType = {
    podcast: record.podcastUrl ?? "",
    episode: record.episodeUrl,
    action: record.kind,
    timestamp: formatTimestamp(record.occurredAtUnix),
  };

  if (record.position !== null) action.position = record.position;
  if (record.started !== null) action.started = record.started;
  if (record.total !== null) action.total = record.total;
  if (record.deviceId) action.device = record.deviceId;
  if (record.metadata) Object.assign(action, record.metadata);

  return action;
}

export function toEpisodeActionWithIdResponse(
  record: EpisodeActionRecord & { id: number },
): EpisodeActionWithIdType {
  return {
    ...toEpisodeActionResponse(record),
    id: record.id,
  };
}

export function toEpisodeActionPageResponse(
  page: EpisodeActionPage,
): PaginatedResponseType<EpisodeActionWithIdType> {
  return {
    items: page.items.map((record) =>
      toEpisodeActionWithIdResponse(record as EpisodeActionRecord & { id: number }),
    ),
    page: {
      next_cursor: page.nextCursor
        ? encodeCursor(page.nextCursor.primary, page.nextCursor.id)
        : null,
      total_count: page.totalCount,
    },
  };
}

export function toEpisodeUploadResponse(
  timestamp: number,
  rewrites: Array<{ from: string; to: string }>,
): EpisodeUploadResponseType {
  return {
    timestamp,
    update_urls: rewrites.map((r) => [r.from, r.to]),
  };
}

function formatTimestamp(unix: number): string {
  return new Date(unix * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}
