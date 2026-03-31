import { useMutation, useQueryClient } from "@tanstack/preact-query";

import type { SubscriptionFilters, SubscriptionItem } from "../lib/api/subscriptions";

import {
  getSubscriptionsPage,
  subscribeToPodcast,
  unsubscribeFromPodcast,
} from "../lib/api/subscriptions";
import { useAuth } from "../lib/auth";
import { usePaginatedQuery } from "./use-paginated-query";

export type { SubscriptionItem };

const PAGE_SIZE = 10;

export function useSubscriptions(deviceId?: string | null, filters?: SubscriptionFilters) {
  const { username } = useAuth();
  const queryClient = useQueryClient();

  const queryKey = [
    "subscriptions",
    username,
    deviceId ?? "all",
    filters?.q ?? null,
    filters?.sort?.by ?? null,
    filters?.sort?.dir ?? null,
  ] as const;

  const query = usePaginatedQuery({
    queryKey,
    queryFn: (cursor) =>
      getSubscriptionsPage(username!, deviceId ?? null, cursor, PAGE_SIZE, filters),
    enabled: !!username,
  });

  const reset = () => {
    query.reset();
    void queryClient.invalidateQueries({
      queryKey: ["subscriptions", username, deviceId ?? "all"],
    });
  };

  return {
    ...query,
    reset,
  };
}

export function useSubscribe() {
  const { username } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ url, deviceId }: { url: string; deviceId: string }) =>
      subscribeToPodcast(username!, deviceId, url),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["subscriptions", username] });
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["subscriptions", username] });
      // Invalidate dashboard summary
      void queryClient.invalidateQueries({ queryKey: ["dashboard", username] });
    },
  });
}
