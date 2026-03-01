import { useMutation, useQuery, useQueryClient } from "@tanstack/preact-query";

import {
  getSubscriptions,
  subscribeToPodcast,
  unsubscribeFromPodcast,
} from "../lib/api/subscriptions";
import { useAuth } from "../lib/auth";

export function useSubscriptions() {
  const { username } = useAuth();

  return useQuery({
    queryKey: ["subscriptions", username],
    queryFn: () => getSubscriptions(username!),
    enabled: !!username,
  });
}

export function useSubscribe() {
  const { username } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (url: string) => subscribeToPodcast(username!, url),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["subscriptions", username] });
    },
  });
}

export function useUnsubscribe() {
  const { username } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (url: string) => unsubscribeFromPodcast(username!, url),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["subscriptions", username] });
    },
  });
}
