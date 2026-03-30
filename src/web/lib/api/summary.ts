import { SummaryResponseType } from "@shared/schemas/index";
import { z } from "zod/v4";

import { API_BASE, apiFetch } from "./fetch";

const EpisodeActionWithIdSchema = z.object({
  id: z.number(),
  podcast: z.string(),
  episode: z.string(),
  action: z.string(),
  timestamp: z.string(),
  position: z.number().optional(),
  started: z.number().optional(),
  total: z.number().optional(),
  device: z.string().optional(),
});

const SummaryResponseSchema = z.object({
  device_count: z.number(),
  subscription_count: z.number(),
  recent_episodes: z.array(EpisodeActionWithIdSchema),
});

export type SummaryResponse = SummaryResponseType;

export async function getSummary(username: string): Promise<SummaryResponse> {
  const path = `${API_BASE}/api/b-ext/summary/${encodeURIComponent(username)}`;
  const res = await apiFetch(path);
  if (!res.ok) throw new Error("Failed to fetch summary");
  return SummaryResponseSchema.parse(await res.json());
}
