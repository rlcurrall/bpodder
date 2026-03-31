import { useQuery } from "@tanstack/preact-query";
import { useEffect, useState } from "preact/hooks";

export interface PaginatedPage<TItem> {
  items: TItem[];
  page: {
    next_cursor: string | null;
    total_count: number | null;
  };
}

interface UsePaginatedQueryOptions<TItem> {
  queryKey: readonly unknown[];
  queryFn: (cursor: string | null) => Promise<PaginatedPage<TItem>>;
  enabled: boolean;
}

export function usePaginatedQuery<TItem>({
  queryKey,
  queryFn,
  enabled,
}: UsePaginatedQueryOptions<TItem>) {
  const [loadedItems, setLoadedItems] = useState<TItem[]>([]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);

  // Reset local pagination state immediately when the logical query changes.
  const keyHash = JSON.stringify(queryKey);

  useEffect(() => {
    setLoadedItems([]);
    setHasNextPage(false);
    setNextCursor(null);
    setTotalCount(null);
  }, [keyHash]);

  const query = useQuery<PaginatedPage<TItem>, Error>({
    queryKey,
    queryFn: () => queryFn(null),
    enabled,
  });

  useEffect(() => {
    if (!query.data) return;

    setLoadedItems(query.data.items);
    setHasNextPage(query.data.page.next_cursor !== null);
    setNextCursor(query.data.page.next_cursor);
    setTotalCount(query.data.page.total_count);
  }, [query.data]);

  const fetchNextPage = async () => {
    if (!nextCursor) return;

    setIsFetchingNextPage(true);
    try {
      const response = await queryFn(nextCursor);
      setLoadedItems((prev) => [...prev, ...response.items]);
      setHasNextPage(response.page.next_cursor !== null);
      setNextCursor(response.page.next_cursor);
      setTotalCount(response.page.total_count);
    } finally {
      setIsFetchingNextPage(false);
    }
  };

  const reset = () => {
    setLoadedItems([]);
    setHasNextPage(false);
    setNextCursor(null);
    setTotalCount(null);
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
    reset,
  };
}
