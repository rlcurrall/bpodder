import { useQuery } from "@tanstack/preact-query";
import { useState } from "preact/hooks";

import type { EpisodeActionWithId, EpisodeFilters } from "../lib/api/episodes";

import { getEpisodeActionsPage } from "../lib/api/episodes";
import { useAuth } from "../lib/auth";

export type { EpisodeActionWithId };

const PAGE_SIZE = 50;

interface EpisodesData {
  items: EpisodeActionWithId[];
  nextCursor: string | null;
  totalCount: number | null;
}

export function useEpisodeActions(filters?: EpisodeFilters) {
  const { username } = useAuth();
  const [loadedItems, setLoadedItems] = useState<EpisodeActionWithId[]>([]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);

  const query = useQuery<EpisodesData, Error>({
    queryKey: ["activity", username, filters],
    queryFn: async () => {
      const response = await getEpisodeActionsPage(username!, null, PAGE_SIZE, filters);
      const data: EpisodesData = {
        items: response.items,
        nextCursor: response.page.next_cursor,
        totalCount: response.page.total_count,
      };
      setLoadedItems(data.items);
      setHasNextPage(data.nextCursor !== null);
      setNextCursor(data.nextCursor);
      setTotalCount(data.totalCount);
      return data;
    },
    enabled: !!username,
  });

  const fetchNextPage = async () => {
    if (!nextCursor || !username) return;

    setIsFetchingNextPage(true);
    try {
      const response = await getEpisodeActionsPage(username, nextCursor, PAGE_SIZE, filters);
      const newItems = response.items;
      setLoadedItems((prev) => [...prev, ...newItems]);
      setHasNextPage(response.page.next_cursor !== null);
      setNextCursor(response.page.next_cursor);
    } finally {
      setIsFetchingNextPage(false);
    }
  };

  return {
    data: loadedItems,
    totalCount,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    isPending: query.isPending,
    error: query.error,
    refetch: query.refetch,
  };
}
