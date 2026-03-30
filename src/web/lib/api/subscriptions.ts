import { ErrorResponse } from "@shared/schemas/index";
import { z } from "zod/v4";

import { API_BASE, apiFetch } from "./fetch";

export interface SubscriptionItem {
  url: string;
  title: string | null;
  image_url: string | null;
}

const SubscriptionItemSchema = z.object({
  url: z.string(),
  title: z.string().nullable(),
  image_url: z.string().nullable(),
});

// Legacy flat-array API (deprecated, kept for compatibility)
export async function getSubscriptions(
  username: string,
  deviceId?: string,
): Promise<SubscriptionItem[]> {
  const path = deviceId
    ? `${API_BASE}/api/b-ext/subscriptions/${encodeURIComponent(username)}/${encodeURIComponent(deviceId)}`
    : `${API_BASE}/api/b-ext/subscriptions/${encodeURIComponent(username)}`;
  const res = await apiFetch(path);
  if (!res.ok) throw new Error("Failed to fetch subscriptions");
  return z.array(SubscriptionItemSchema).parse(await res.json());
}

// Paginated response schema
const PageSchema = z.object({
  next_cursor: z.string().nullable(),
  total_count: z.number().nullable(),
});

const PaginatedSubscriptionsResponseSchema = z.object({
  items: z.array(SubscriptionItemSchema),
  page: PageSchema,
});

async function throwSubscriptionsError(res: Response, fallback: string): Promise<never> {
  const body = ErrorResponse.safeParse(await res.json().catch(() => null));
  throw new Error(body.success ? body.data.message : fallback);
}

export interface PaginatedSubscriptionsResponse {
  items: SubscriptionItem[];
  page: {
    next_cursor: string | null;
    total_count: number | null;
  };
}

export interface SubscriptionFilters {
  q?: string;
  sort?: {
    by: "changed" | "title" | "url";
    dir: "asc" | "desc";
  };
}

export async function getSubscriptionsPage(
  username: string,
  deviceId: string | null,
  cursor: string | null,
  limit: number = 50,
  filters?: SubscriptionFilters,
): Promise<PaginatedSubscriptionsResponse> {
  const path = deviceId
    ? `${API_BASE}/api/b-ext/subscriptions/${encodeURIComponent(username)}/${encodeURIComponent(deviceId)}`
    : `${API_BASE}/api/b-ext/subscriptions/${encodeURIComponent(username)}`;

  const url = new URL(path, window.location.origin);
  url.searchParams.set("limit", String(limit));
  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }
  if (filters?.q) {
    url.searchParams.set("q", filters.q);
  }
  if (filters?.sort) {
    url.searchParams.set("sort.by", filters.sort.by);
    url.searchParams.set("sort.dir", filters.sort.dir);
  }

  const res = await apiFetch(url.pathname + url.search);
  if (!res.ok) {
    await throwSubscriptionsError(res, "Failed to fetch subscriptions");
  }
  return PaginatedSubscriptionsResponseSchema.parse(await res.json());
}

export async function subscribeToPodcast(
  username: string,
  deviceId: string,
  url: string,
): Promise<void> {
  const res = await apiFetch(
    `${API_BASE}/api/2/subscriptions/${encodeURIComponent(username)}/${encodeURIComponent(deviceId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ add: [url] }),
    },
  );
  if (!res.ok) throw new Error("Failed to subscribe");
}

export async function unsubscribeFromPodcast(
  username: string,
  deviceId: string,
  url: string,
): Promise<void> {
  const res = await apiFetch(
    `${API_BASE}/api/2/subscriptions/${encodeURIComponent(username)}/${encodeURIComponent(deviceId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remove: [url] }),
    },
  );
  if (!res.ok) throw new Error("Failed to unsubscribe");
}

export function getOpmlUrl(username: string, deviceId?: string): string {
  return deviceId
    ? `${API_BASE}/subscriptions/${encodeURIComponent(username)}/${encodeURIComponent(deviceId)}.opml`
    : `${API_BASE}/subscriptions/${encodeURIComponent(username)}.opml`;
}
