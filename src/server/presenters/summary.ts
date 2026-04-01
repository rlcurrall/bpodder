import type { UserSummary } from "@services/summary/types";
import type { SummaryResponseType } from "@shared/schemas/summary";

import { toEpisodeActionWithIdResponse } from "./episodes";

export function toSummaryResponse(summary: UserSummary): SummaryResponseType {
  return {
    device_count: summary.deviceCount,
    subscription_count: summary.subscriptionCount,
    recent_episodes: summary.recentEpisodes.map(toEpisodeActionWithIdResponse),
  };
}
