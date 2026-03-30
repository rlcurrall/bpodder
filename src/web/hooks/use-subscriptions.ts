import { useMutation, useQuery, useQueryClient } from "@tanstack/preact-query";

import {
  getSubscriptions,
  subscribeToPodcast,
  unsubscribeFromPodcast,
} from "../lib/api/subscriptions";
import { useAuth } from "../lib/auth";

export type { SubscriptionItem } from "../lib/api/subscriptions";

export function useSubscriptions(deviceId?: string | null) {
  const { username } = useAuth();

  return useQuery({
    queryKey: ["subscriptions", username, deviceId ?? "all"],
    queryFn: () => getSubscriptions(username!, deviceId ?? undefined),
    enabled: !!username,
  });
}

export function useSubscribe() {
  const { username } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ url, deviceId }: { url: string; deviceId: string }) =>
      subscribeToPodcast(username!, deviceId, url),
    onSuccess: (_data, { deviceId }) => {
      void queryClient.invalidateQueries({ queryKey: ["subscriptions", username, deviceId] });
      void queryClient.invalidateQueries({ queryKey: ["subscriptions", username, "all"] });
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
      void queryClient.invalidateQueries({ queryKey: ["subscriptions", username, deviceId] });
      void queryClient.invalidateQueries({ queryKey: ["subscriptions", username, "all"] });
    },
  });
}
