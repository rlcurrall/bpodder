import { SettingsResponse } from "../../../lib/schemas/index";
import { API_BASE, apiFetch } from "./fetch";

export async function getSettings(username: string): Promise<Record<string, unknown>> {
  const res = await apiFetch(`${API_BASE}/api/2/settings/${encodeURIComponent(username)}.json`);
  if (!res.ok) throw new Error("Failed to fetch settings");
  return SettingsResponse.parse(await res.json());
}

export async function updateSettings(
  username: string,
  settings: Record<string, string>,
): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/2/settings/${encodeURIComponent(username)}.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error("Failed to update settings");
}
