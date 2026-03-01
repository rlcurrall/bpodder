import { DeviceResponse, DeviceResponseType } from "@shared/schemas/index";
import { z } from "zod/v4";

import { API_BASE, apiFetch } from "./fetch";

export type Device = DeviceResponseType;

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
