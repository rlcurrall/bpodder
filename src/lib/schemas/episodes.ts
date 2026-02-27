import { z } from "zod/v4";

const validActions = ["play", "download", "delete", "new", "flattr"] as const;

export const EpisodeActionRequest = z
  .object({
    podcast: z.string().min(1, "Missing required field: podcast"),
    episode: z.string().min(1, "Missing required field: episode"),
    action: z.string().min(1, "Missing required field: action"),
    timestamp: z.union([z.string(), z.number()]).optional(),
    position: z.number().optional(),
    started: z.number().optional(),
    total: z.number().optional(),
    device: z.string().optional(),
    guid: z.string().optional(),
  })
  .passthrough()
  .transform((data) => ({
    ...data,
    action: data.action.toLowerCase(),
  }))
  .pipe(
    z
      .object({
        podcast: z.string(),
        episode: z.string(),
        action: z.enum(validActions, {
          message: `Invalid action: must be one of ${validActions.join(", ")}`,
        }),
        timestamp: z.union([z.string(), z.number()]).optional(),
        position: z.number().optional(),
        started: z.number().optional(),
        total: z.number().optional(),
        device: z.string().optional(),
        guid: z.string().optional(),
      })
      .loose(),
  );

export const EpisodeListRequest = z.object({
  since: z.number().default(0),
  podcast: z.string().optional(),
  device: z.string().optional(),
  aggregated: z.boolean().default(false),
});

export const EpisodeActionResponse = z
  .object({
    podcast: z.string(),
    episode: z.string(),
    action: z.string(),
    timestamp: z.string(),
    position: z.number().optional(),
    started: z.number().optional(),
    total: z.number().optional(),
    device: z.string().optional(),
  })
  .loose();

export const EpisodeListResponse = z.object({
  timestamp: z.number(),
  actions: z.array(EpisodeActionResponse),
  update_urls: z.array(z.array(z.string())).default([]),
});

export const EpisodeUploadResponse = z.object({
  timestamp: z.number(),
  update_urls: z.array(z.array(z.string())),
});

export const EpisodeUploadRequest = z.union([
  z.array(EpisodeActionRequest),
  z.object({
    actions: z.array(EpisodeActionRequest),
  }),
]);

export type EpisodeActionResponseType = z.infer<typeof EpisodeActionResponse>;
export type EpisodeListResponseType = z.infer<typeof EpisodeListResponse>;
export type EpisodeUploadResponseType = z.infer<typeof EpisodeUploadResponse>;
export type EpisodeUploadRequestType = z.infer<typeof EpisodeUploadRequest>;
