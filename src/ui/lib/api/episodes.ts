import { EpisodeActionResponseType, EpisodeListResponse } from "../../../lib/schemas/index";
import { API_BASE, apiFetch } from "./fetch";

export type EpisodeAction = EpisodeActionResponseType;

export async function getEpisodeActions(username: string): Promise<EpisodeAction[]> {
  const res = await apiFetch(`${API_BASE}/api/2/episodes/${encodeURIComponent(username)}?since=0`);
  if (!res.ok) throw new Error("Failed to fetch episode actions");
  const data = EpisodeListResponse.parse(await res.json());
  return data.actions || [];
}
