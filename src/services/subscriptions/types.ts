export type SubscriptionSortBy = "title" | "url" | "changed";
export type SubscriptionSortDir = "asc" | "desc";

export interface SubscriptionDeviceRow {
  id: number;
}

export interface SubscriptionRecord {
  url: string;
  title: string | null;
  imageUrl: string | null;
}

export interface SubscriptionPageCursor {
  sortBy: SubscriptionSortBy;
  sortDir: SubscriptionSortDir;
  primary: string | number;
  id: number;
}

export interface SubscriptionPage {
  items: SubscriptionRecord[];
  nextCursor: SubscriptionPageCursor | null;
  totalCount: number;
}

export interface ListSubscriptionsOptions {
  userId: number;
  deviceId?: number;
  limit: number;
  cursor: SubscriptionPageCursor | null;
  q?: string;
  sortBy: SubscriptionSortBy;
  sortDir: SubscriptionSortDir;
}

export interface SubscriptionDelta {
  add: string[];
  remove: string[];
}

export interface UrlRewrite {
  from: string;
  to: string;
}

export interface SyncSubscriptionDeltaResult {
  timestamp: number;
  rewrites: UrlRewrite[];
  addedFetchUrls: string[];
}

export interface SubscriptionFeedRow {
  url: string;
  data: string | null;
}
