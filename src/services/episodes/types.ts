// Service-layer DTOs - business logic types, not API types

export interface EpisodeActionInput {
  podcastUrl: string;
  episodeUrl: string;
  kind: "play" | "download" | "delete" | "new" | "flattr";
  occurredAtUnix?: number;
  position?: number;
  started?: number;
  total?: number;
  deviceId?: string;
  metadata?: Record<string, unknown>;
}

export interface RecordEpisodeActionsCommand {
  userId: number;
  receivedAtUnix: number;
  actions: EpisodeActionInput[];
}

export interface UrlRewrite {
  from: string;
  to: string;
}

export interface RecordEpisodeActionsResult {
  rewrites: UrlRewrite[];
}

export interface EpisodeActionRecord {
  id?: number;
  podcastUrl: string | null;
  episodeUrl: string;
  kind: string;
  occurredAtUnix: number;
  position: number | null;
  started: number | null;
  total: number | null;
  deviceId: string | null;
  metadata: Record<string, unknown> | null;
}

export interface EpisodeActionPage {
  items: EpisodeActionRecord[];
  nextCursor: { primary: number; id: number } | null;
  totalCount: number;
}

export interface ListEpisodeActionsOptions {
  userId: number;
  limit: number;
  cursor: { primary: number; id: number } | null;
  podcast?: string;
  device?: string;
  action?: string;
}

export interface ListEpisodeActionsSinceOptions {
  userId: number;
  since: number;
  podcast?: string;
  device?: string;
  aggregated: boolean;
}
