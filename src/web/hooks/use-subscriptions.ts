import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/preact-query";

import type { SubscriptionFilters, SubscriptionItem } from "../lib/api/subscriptions";

import {
  getSubscriptionsPage,
  subscribeToPodcast,
  unsubscribeFromPodcast,
} from "../lib/api/subscriptions";
import { useAuth } from "../lib/auth";

export type { SubscriptionItem };

const PAGE_SIZE = 10;

export function useSubscriptions(deviceId?: string | null, filters?: SubscriptionFilters) {
  const { username } = useAuth();
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: [
      "subscriptions",
      username,
      deviceId ?? "all",
      filters?.q ?? null,
      filters?.sort?.by ?? null,
      filters?.sort?.dir ?? null,
    ],
    queryFn: ({ pageParam }) =>
      getSubscriptionsPage(username!, deviceId ?? null, pageParam, PAGE_SIZE, filters),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.page.next_cursor ?? undefined,
    enabled: !!username,
  });

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const totalCount = query.data?.pages[0]?.page.total_count ?? null;

  const reset = () => {
    queryClient.removeQueries({
      queryKey: ["subscriptions", username, deviceId ?? "all"],
    });
  };

  return {
    data: items,
    totalCount,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    isPending: query.isPending,
    error: query.error,
    refetch: query.refetch,
    reset,
  };
}

export function useSubscribe() {
  const { username } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ url, deviceId }: { url: string; deviceId: string }) =>
      subscribeToPodcast(username!, deviceId, url),
    onSuccess: (_data, { deviceId }) => {
      // Reset paginated queries to ensure fresh data after mutation
      queryClient.removeQueries({
        queryKey: ["subscriptions", username, deviceId],
      });
      queryClient.removeQueries({
        queryKey: ["subscriptions", username, "all"],
      });
      // Invalidate dashboard summary
      void queryClient.invalidateQueries({ queryKey: ["dashboard", username] });
    },
  });
}

export function useUnsubscribe() {
  const { username } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ url, deviceId }: { url: string; deviceId: string }) =>
      unsubscribeFromPodcast(username!, deviceId, url),
    onSuccess: (_data, { deviceId }) => {
      // Reset paginated queries to ensure fresh data after mutation
      queryClient.removeQueries({
        queryKey: ["subscriptions", username, deviceId],
      });
      queryClient.removeQueries({
        queryKey: ["subscriptions", username, "all"],
      });
      // Invalidate dashboard summary
      void queryClient.invalidateQueries({ queryKey: ["dashboard", username] });
    },
  });
}
