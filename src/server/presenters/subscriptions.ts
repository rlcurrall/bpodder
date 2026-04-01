import type { SubscriptionPage, SubscriptionRecord } from "@services/subscriptions/types";
import type { PaginatedResponseType } from "@shared/schemas/pagination";
import type {
  SubscriptionDeltaResponseType,
  SubscriptionItemType,
  SubscriptionSortByType,
  SubscriptionSortDirType,
  SubscriptionUploadResponseType,
} from "@shared/schemas/subscriptions";

export function toSubscriptionItem(record: SubscriptionRecord): SubscriptionItemType {
  return {
    url: record.url,
    title: record.title,
    image_url: record.imageUrl,
  };
}

export function toSubscriptionPageResponse(
  page: SubscriptionPage,
): PaginatedResponseType<SubscriptionItemType> {
  return {
    items: page.items.map(toSubscriptionItem),
    page: {
      next_cursor: page.nextCursor ? encodeSubscriptionPageCursor(page.nextCursor) : null,
      total_count: page.totalCount,
    },
  };
}

export function toSubscriptionDeltaResponse(
  delta: { add: string[]; remove: string[] },
  timestamp: number,
): SubscriptionDeltaResponseType {
  return {
    ...delta,
    timestamp,
    update_urls: [],
  };
}

export function toSubscriptionUploadResponse(result: {
  timestamp: number;
  rewrites: Array<{ from: string; to: string }>;
}): SubscriptionUploadResponseType {
  return {
    timestamp: result.timestamp,
    update_urls: result.rewrites.map((rewrite) => [rewrite.from, rewrite.to]),
  };
}

function encodeSubscriptionPageCursor(cursor: {
  sortBy: SubscriptionSortByType;
  sortDir: SubscriptionSortDirType;
  primary: string | number;
  id: number;
}): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      by: cursor.sortBy,
      dir: cursor.sortDir,
      primary: cursor.primary,
      id: cursor.id,
    }),
  ).toString("base64url");
}
