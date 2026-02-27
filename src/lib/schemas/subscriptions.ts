import { z } from "zod/v4";

export const SubscriptionChangeRequest = z.object({
  add: z.array(z.string()).default([]),
  remove: z.array(z.string()).default([]),
});

const SubscriptionReplaceItem = z.union([
  z.string(),
  z.object({
    feed: z.string(),
    title: z.string().optional(),
  }),
]);

export const SubscriptionReplaceRequest = z.array(SubscriptionReplaceItem);

export const SubscriptionSyncRequest = z.object({
  add: z.array(z.string()).default([]),
  remove: z.array(z.string()).default([]),
});

export const SubscriptionDeltaResponse = z.object({
  add: z.array(z.string()),
  remove: z.array(z.string()),
  timestamp: z.number(),
  update_urls: z.array(z.array(z.string())),
});

export const SubscriptionListResponse = z.array(z.string());

export type SubscriptionSyncRequestType = z.infer<typeof SubscriptionSyncRequest>;
export type SubscriptionReplaceRequestType = z.infer<typeof SubscriptionReplaceRequest>;
