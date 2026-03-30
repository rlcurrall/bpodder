import { z } from "zod/v4";

import { EpisodeActionWithId } from "./episodes";

export const SummaryResponse = z.object({
  device_count: z.number(),
  subscription_count: z.number(),
  recent_episodes: z.array(EpisodeActionWithId),
});

export type SummaryResponseType = z.infer<typeof SummaryResponse>;
