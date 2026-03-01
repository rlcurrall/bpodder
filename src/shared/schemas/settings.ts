import { z } from "zod/v4";

export const validScopes = ["account", "device", "podcast", "episode"] as const;
export type Scope = (typeof validScopes)[number];

export const SettingsUpdateRequest = z.object({
  set: z.record(z.string(), z.unknown()).optional(),
  remove: z.array(z.string()).optional(),
});

export const SettingsResponse = z.record(z.string(), z.unknown());

export type SettingsResponseType = z.infer<typeof SettingsResponse>;
export type SettingsUpdateRequestType = z.infer<typeof SettingsUpdateRequest>;
