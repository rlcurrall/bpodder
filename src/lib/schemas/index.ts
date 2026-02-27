import { z } from "zod/v4";

export const UiConfigResponse = z.object({
  title: z.string(),
  enableRegistration: z.boolean(),
});

export type UiConfigResponseType = z.infer<typeof UiConfigResponse>;

export { isHttpUrl, ErrorResponse, SuccessResponse } from "./common";
export type { ErrorType, SuccessType } from "./common";

export { LoginRequest, LoginResponse, RegisterRequest, RegisterResponse } from "./auth";
export type {
  LoginRequestType,
  LoginResponseType,
  RegisterRequestType,
  RegisterResponseType,
} from "./auth";

export { DeviceUpdateRequest, DeviceResponse, DeviceListResponse } from "./devices";
export type { DeviceResponseType, DeviceUpdateRequestType } from "./devices";

export { SyncRequest, SyncStatusResponse } from "./sync";
export type { SyncRequestType, SyncStatusResponseType } from "./sync";

export {
  SubscriptionSyncRequest,
  SubscriptionReplaceRequest,
  SubscriptionDeltaResponse,
  SubscriptionUploadResponse,
  SubscriptionListResponse,
} from "./subscriptions";
export type { SubscriptionSyncRequestType, SubscriptionReplaceRequestType } from "./subscriptions";

export {
  EpisodeActionRequest,
  EpisodeListRequest,
  EpisodeActionResponse,
  EpisodeListResponse,
  EpisodeUploadResponse,
  EpisodeUploadRequest,
} from "./episodes";
export type {
  EpisodeActionResponseType,
  EpisodeListResponseType,
  EpisodeUploadResponseType,
  EpisodeUploadRequestType,
} from "./episodes";

export { SettingsUpdateRequest, SettingsResponse, validScopes } from "./settings";
export type { SettingsResponseType, SettingsUpdateRequestType, Scope } from "./settings";
