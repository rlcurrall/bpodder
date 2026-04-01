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

export const SubscriptionUploadResponse = z.object({
  timestamp: z.number(),
  update_urls: z.array(z.array(z.string())),
});

export const SubscriptionListResponse = z.array(z.string());

export const SubscriptionItem = z.object({
  url: z.string(),
  title: z.string().nullable(),
  image_url: z.string().nullable(),
});

export const SubscriptionSortBySchema = z.enum(["changed", "title", "url"]);
export const SubscriptionSortDirSchema = z.enum(["asc", "desc"]);

export const RawSubscriptionCursorSchema = z
  .object({
    v: z.literal(1),
    by: SubscriptionSortBySchema,
    dir: SubscriptionSortDirSchema,
    primary: z.union([z.number().int(), z.string()]),
    id: z.number().int(),
  })
  .strict();

export const SubscriptionListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(1).optional(),
  q: z.string().min(1).optional(),
  sortBy: SubscriptionSortBySchema.default("changed"),
  sortDir: SubscriptionSortDirSchema.default("desc"),
});

export type SubscriptionSyncRequestType = z.infer<typeof SubscriptionSyncRequest>;
export type SubscriptionReplaceRequestType = z.infer<typeof SubscriptionReplaceRequest>;
export type SubscriptionDeltaResponseType = z.infer<typeof SubscriptionDeltaResponse>;
export type SubscriptionUploadResponseType = z.infer<typeof SubscriptionUploadResponse>;
export type SubscriptionItemType = z.infer<typeof SubscriptionItem>;
export type SubscriptionListQueryType = z.infer<typeof SubscriptionListQuerySchema>;
export type SubscriptionSortByType = z.infer<typeof SubscriptionSortBySchema>;
export type SubscriptionSortDirType = z.infer<typeof SubscriptionSortDirSchema>;
export type SubscriptionCursorType = z.infer<typeof RawSubscriptionCursorSchema>;
