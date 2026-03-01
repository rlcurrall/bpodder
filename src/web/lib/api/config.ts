import { UiConfigResponse, UiConfigResponseType } from "@shared/schemas/index";

import { API_BASE } from "./fetch";

export type UiConfig = UiConfigResponseType;

export async function getUiConfig(): Promise<UiConfig> {
  const res = await fetch(`${API_BASE}/api/b-ext/config`);
  return UiConfigResponse.parse(await res.json());
}
