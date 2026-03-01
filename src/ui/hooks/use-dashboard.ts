import { useQuery } from "@tanstack/preact-query";

import type { Device } from "../lib/api/devices";
import type { EpisodeAction } from "../lib/api/episodes";

import { getDevices } from "../lib/api/devices";
import { getEpisodeActions } from "../lib/api/episodes";
import { getSubscriptions } from "../lib/api/subscriptions";
import { useAuth } from "../lib/auth";

export type { Device, EpisodeAction };

export function useDashboard() {
  const { username } = useAuth();

  return useQuery({
    queryKey: ["dashboard", username],
    queryFn: async () => {
      const [devices, subscriptions, episodes] = await Promise.all([
        getDevices(username!),
        getSubscriptions(username!),
        getEpisodeActions(username!),
      ]);
      return { devices, subscriptions, episodes: episodes.slice(0, 10) } as {
        devices: Device[];
        subscriptions: string[];
        episodes: EpisodeAction[];
      };
    },
    enabled: !!username,
  });
}
