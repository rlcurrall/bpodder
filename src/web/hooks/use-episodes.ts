import { useQuery } from "@tanstack/preact-query";

import type { EpisodeAction } from "../lib/api/episodes";

import { getEpisodeActions } from "../lib/api/episodes";
import { useAuth } from "../lib/auth";

export type { EpisodeAction };

export function useEpisodeActions() {
  const { username } = useAuth();

  return useQuery({
    queryKey: ["activity", username],
    queryFn: () => getEpisodeActions(username!),
    enabled: !!username,
  });
}
