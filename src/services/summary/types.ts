import type { EpisodeActionRecord } from "@services/episodes/types";

export interface UserSummary {
  deviceCount: number;
  subscriptionCount: number;
  recentEpisodes: Array<EpisodeActionRecord & { id: number }>;
}
