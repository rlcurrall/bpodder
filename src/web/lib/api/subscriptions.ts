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
