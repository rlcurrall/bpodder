import { z } from "zod/v4";

export const SyncRequest = z.object({
  synchronize: z.array(z.array(z.string())).optional(),
  "stop-synchronize": z.array(z.string()).optional(),
});

export const SyncStatusResponse = z.object({
  synchronized: z.array(z.array(z.string())),
  "not-synchronized": z.array(z.string()),
});

export type SyncRequestType = z.infer<typeof SyncRequest>;
export type SyncStatusResponseType = z.infer<typeof SyncStatusResponse>;
