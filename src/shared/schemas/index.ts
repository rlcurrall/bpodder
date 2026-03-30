import { z } from "zod/v4";

export const UiConfigResponse = z.object({
  title: z.string(),
  enableRegistration: z.boolean(),
});

export type UiConfigResponseType = z.infer<typeof UiConfigResponse>;

export { isHttpUrl, ErrorResponse, SuccessResponse } from "./common";
export type { ErrorType, SuccessType } from "./common";

export {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  ChangePasswordRequest,
  DeleteAccountRequest,
} from "./auth";
export type {
  LoginRequestType,
  LoginResponseType,
  RegisterRequestType,
  RegisterResponseType,
  ChangePasswordRequestType,
  DeleteAccountRequestType,
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
  SubscriptionItem,
  SubscriptionSortBySchema,
  SubscriptionSortDirSchema,
  RawSubscriptionCursorSchema,
  SubscriptionListQuerySchema,
} from "./subscriptions";
export type {
  SubscriptionSyncRequestType,
  SubscriptionReplaceRequestType,
  SubscriptionItemType,
  SubscriptionListQueryType,
  SubscriptionSortByType,
  SubscriptionSortDirType,
  SubscriptionCursorType,
} from "./subscriptions";

export { PaginatedQuerySchema, PaginatedResponseSchema } from "./pagination";
export type { PaginatedQueryType, PaginatedResponseType } from "./pagination";

export {
  EpisodeActionRequest,
  EpisodeListRequest,
  EpisodeActionResponse,
  EpisodeActionWithId,
  EpisodeListResponse,
  EpisodeUploadResponse,
  EpisodeUploadRequest,
} from "./episodes";
export type {
  EpisodeActionResponseType,
  EpisodeActionWithIdType,
  EpisodeListResponseType,
  EpisodeUploadResponseType,
  EpisodeUploadRequestType,
} from "./episodes";

export { SettingsUpdateRequest, SettingsResponse, validScopes } from "./settings";
export type { SettingsResponseType, SettingsUpdateRequestType, Scope } from "./settings";

export { SummaryResponse } from "./summary";
export type { SummaryResponseType } from "./summary";
