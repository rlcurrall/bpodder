import type { EpisodeActionWithId, EpisodeFilters } from "../lib/api/episodes";

import { getEpisodeActionsPage } from "../lib/api/episodes";
import { useAuth } from "../lib/auth";
import { usePaginatedQuery } from "./use-paginated-query";

export type { EpisodeActionWithId };

const PAGE_SIZE = 50;

export function useEpisodeActions(filters?: EpisodeFilters) {
  const { username } = useAuth();
  return usePaginatedQuery({
    queryKey: ["activity", username, filters],
    queryFn: (cursor) => getEpisodeActionsPage(username!, cursor, PAGE_SIZE, filters),
    enabled: !!username,
  });
}
