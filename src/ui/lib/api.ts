import { z } from "zod/v4";

import {
  DeviceResponse,
  DeviceResponseType,
  EpisodeActionResponseType,
  EpisodeListResponse,
  ErrorResponse,
  LoginRequest,
  RegisterRequest,
  UiConfigResponse,
  UiConfigResponseType,
  SettingsResponse,
} from "../../lib/schemas/index";

const API_BASE = "";

function handleUnauthorized() {
  localStorage.removeItem("username");
  window.location.hash = "#/login";
}

async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    credentials: "include",
  });
  if (res.status === 401) {
    handleUnauthorized();
  }
  return res;
}

export type UiConfig = UiConfigResponseType;
export type Device = DeviceResponseType;

export type EpisodeAction = EpisodeActionResponseType;

export async function getUiConfig(): Promise<UiConfig> {
  const res = await fetch(`${API_BASE}/api/b-ext/config`);
  return UiConfigResponse.parse(await res.json());
}

export async function login(username: string, password: string): Promise<boolean> {
  const body = LoginRequest.parse({ username, password });
  const res = await fetch(`${API_BASE}/api/b-ext/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    credentials: "include",
  });
  return res.ok;
}

export async function logout(username: string): Promise<void> {
  await apiFetch(`${API_BASE}/api/2/auth/${encodeURIComponent(username)}/logout.json`, {
    method: "POST",
  });
  localStorage.removeItem("username");
}

export interface RegisterResult {
  success: boolean;
  error?: string;
}

export async function register(
  username: string,
  password: string,
  passwordConfirm?: string,
): Promise<RegisterResult> {
  const body = RegisterRequest.parse({ username, password, passwordConfirm });
  const res = await fetch(`${API_BASE}/api/b-ext/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });

  if (res.ok) {
    return { success: true };
  }

  // Try to get error message from response body
  try {
    const body = ErrorResponse.parse(await res.json());
    return {
      success: false,
      error: body.message || "Registration failed",
    };
  } catch {
    // Response body isn't JSON or doesn't have message field
    console.error("Registration failed with status", res.status, res);
  }

  return { success: false, error: "Registration failed" };
}

export async function getDevices(username: string): Promise<Device[]> {
  const res = await apiFetch(`${API_BASE}/api/2/devices/${encodeURIComponent(username)}.json`);
  if (!res.ok) throw new Error("Failed to fetch devices");
  return z.array(DeviceResponse).parse(await res.json());
}

export async function updateDevice(
  username: string,
  deviceId: string,
  updates: { caption?: string; type?: string },
): Promise<void> {
  const res = await apiFetch(
    `${API_BASE}/api/2/devices/${encodeURIComponent(username)}/${encodeURIComponent(deviceId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    },
  );
  if (!res.ok) throw new Error("Failed to update device");
}

export async function getSubscriptions(username: string): Promise<string[]> {
  const res = await apiFetch(
    `${API_BASE}/api/2/subscriptions/${encodeURIComponent(username)}.json`,
  );
  if (!res.ok) throw new Error("Failed to fetch subscriptions");
  return z.array(z.string()).parse(await res.json());
}

export async function getEpisodeActions(username: string): Promise<EpisodeAction[]> {
  const res = await apiFetch(`${API_BASE}/api/2/episodes/${encodeURIComponent(username)}?since=0`);
  if (!res.ok) throw new Error("Failed to fetch episode actions");
  const data = EpisodeListResponse.parse(await res.json());
  return data.actions || [];
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
