import { useInfiniteQuery } from "@tanstack/preact-query";

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
  const query = useInfiniteQuery({
    queryKey: [...queryKey],
    queryFn: ({ pageParam }) => queryFn(pageParam as string | null),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.page.next_cursor,
    enabled,
  });

  const flattenPages = () => {
    if (!query.data) return [];
    return query.data.pages.flatMap((page) => page.items);
  };

  const lastPage = query.data?.pages[query.data.pages.length - 1];
  const hasNextPage = lastPage?.page.next_cursor !== null;
  const totalCount = lastPage?.page.total_count ?? null;

  return {
    data: flattenPages(),
    totalCount,
    hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    isPending: query.isPending,
    error: query.error,
    refetch: query.refetch,
  };
}
