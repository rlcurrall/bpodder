import { z } from "zod/v4";

import { API_BASE, apiFetch } from "./fetch";

export async function getSubscriptions(username: string): Promise<string[]> {
  const res = await apiFetch(
    `${API_BASE}/api/2/subscriptions/${encodeURIComponent(username)}.json`,
  );
  if (!res.ok) throw new Error("Failed to fetch subscriptions");
  return z.array(z.string()).parse(await res.json());
}

export async function subscribeToPodcast(username: string, url: string): Promise<void> {
  const res = await apiFetch(
    `${API_BASE}/api/2/subscriptions/${encodeURIComponent(username)}.json`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ add: [url] }),
    },
  );
  if (!res.ok) throw new Error("Failed to subscribe");
}

export async function unsubscribeFromPodcast(username: string, url: string): Promise<void> {
  const res = await apiFetch(
    `${API_BASE}/api/2/subscriptions/${encodeURIComponent(username)}.json`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remove: [url] }),
    },
  );
  if (!res.ok) throw new Error("Failed to unsubscribe");
}

export function getOpmlUrl(username: string): string {
  return `${API_BASE}/subscriptions/${encodeURIComponent(username)}.opml`;
}
