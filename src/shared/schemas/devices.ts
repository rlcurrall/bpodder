import { z } from "zod/v4";

export const DeviceUpdateRequest = z
  .object({
    caption: z.string().optional(),
    type: z.enum(["desktop", "laptop", "mobile", "server", "other"]).optional(),
  })
  .catch({ caption: undefined, type: undefined });

export const DeviceResponse = z.object({
  id: z.string(),
  caption: z.string(),
  type: z.string(),
  subscriptions: z.number(),
});

export const DeviceListResponse = z.array(DeviceResponse);

export type DeviceResponseType = z.infer<typeof DeviceResponse>;
export type DeviceUpdateRequestType = z.infer<typeof DeviceUpdateRequest>;
