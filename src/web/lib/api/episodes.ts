import {
  EpisodeActionResponseType,
  EpisodeActionWithIdType,
  EpisodeListResponse,
} from "@shared/schemas/index";
import { z } from "zod/v4";

import { API_BASE, apiFetch } from "./fetch";

export type EpisodeAction = EpisodeActionResponseType;
export type EpisodeActionWithId = EpisodeActionWithIdType;

// Legacy flat-array API (GPodder spec compatible)
export async function getEpisodeActions(username: string): Promise<EpisodeAction[]> {
  const res = await apiFetch(`${API_BASE}/api/2/episodes/${encodeURIComponent(username)}?since=0`);
  if (!res.ok) throw new Error("Failed to fetch episode actions");
  const data = EpisodeListResponse.parse(await res.json());
  return data.actions || [];
}

// Paginated response schema
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

const PageSchema = z.object({
  next_cursor: z.string().nullable(),
  total_count: z.number().nullable(),
});

const PaginatedEpisodesResponseSchema = z.object({
  items: z.array(EpisodeActionWithIdSchema),
  page: PageSchema,
});

export interface PaginatedEpisodesResponse {
  items: EpisodeActionWithId[];
  page: {
    next_cursor: string | null;
    total_count: number | null;
  };
}

export interface EpisodeFilters {
  podcast?: string;
  device?: string;
  action?: string;
}

export async function getEpisodeActionsPage(
  username: string,
  cursor: string | null,
  limit: number = 50,
  filters?: EpisodeFilters,
): Promise<PaginatedEpisodesResponse> {
  const path = `${API_BASE}/api/b-ext/episodes/${encodeURIComponent(username)}`;

  const url = new URL(path, window.location.origin);
  url.searchParams.set("limit", String(limit));
  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }
  if (filters?.podcast) {
    url.searchParams.set("podcast", filters.podcast);
  }
  if (filters?.device) {
    url.searchParams.set("device", filters.device);
  }
  if (filters?.action) {
    url.searchParams.set("action", filters.action);
  }

  const res = await apiFetch(url.pathname + url.search);
  if (!res.ok) throw new Error("Failed to fetch episode actions");
  return PaginatedEpisodesResponseSchema.parse(await res.json());
}
