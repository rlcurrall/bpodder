import { DeviceType, EpisodeActionTypeResponse, UiConfigType } from "../../lib/schemas";

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

export type UiConfig = UiConfigType;
export type Device = DeviceType;

export type EpisodeAction = EpisodeActionTypeResponse;

export async function getUiConfig(): Promise<UiConfig> {
  const res = await fetch(`${API_BASE}/api/b-ext/config`);
  return res.json();
}

export async function login(username: string, password: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/b-ext/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
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
  const res = await fetch(`${API_BASE}/api/2/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, passwordConfirm }),
    credentials: "include",
  });

  if (res.ok) {
    return { success: true };
  }

  // Try to get error message from response body (API returns "message", not "error")
  try {
    const body = await res.json();
    if (body.message) {
      return { success: false, error: body.message };
    }
    if (body.error) {
      return { success: false, error: body.error };
    }
  } catch {
    // Response body isn't JSON or doesn't have error/message field
  }

  return { success: false, error: "Registration failed" };
}

export async function getDevices(username: string): Promise<Device[]> {
  const res = await apiFetch(`${API_BASE}/api/2/devices/${encodeURIComponent(username)}.json`);
  if (!res.ok) throw new Error("Failed to fetch devices");
  return res.json();
}

export async function getSubscriptions(username: string): Promise<string[]> {
  const res = await apiFetch(
    `${API_BASE}/api/2/subscriptions/${encodeURIComponent(username)}.json`,
  );
  if (!res.ok) throw new Error("Failed to fetch subscriptions");
  return res.json();
}

export async function getEpisodeActions(username: string): Promise<EpisodeAction[]> {
  const res = await apiFetch(`${API_BASE}/api/2/episodes/${encodeURIComponent(username)}?since=0`);
  if (!res.ok) throw new Error("Failed to fetch episode actions");
  const data = await res.json();
  return data.actions || [];
}
