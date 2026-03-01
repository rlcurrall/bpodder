import type { SettingsResponseType } from "@shared/schemas";

import { useQuery } from "@tanstack/preact-query";

import { getSettings } from "../lib/api/settings";
import { useAuth } from "../lib/auth";

export function useSettings() {
  const { username } = useAuth();

  return useQuery<SettingsResponseType>({
    queryKey: ["settings", username],
    queryFn: () => getSettings(username!),
    enabled: !!username,
  });
}
