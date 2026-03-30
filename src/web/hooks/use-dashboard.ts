import { useQuery } from "@tanstack/preact-query";

import type { SummaryResponse } from "../lib/api/summary";

import { getSummary } from "../lib/api/summary";
import { useAuth } from "../lib/auth";

export type { SummaryResponse };

export function useDashboard() {
  const { username } = useAuth();

  return useQuery({
    queryKey: ["dashboard", username],
    queryFn: () => getSummary(username!),
    enabled: !!username,
  });
}
