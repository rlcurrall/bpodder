import {
  RawSubscriptionCursorSchema,
  type SubscriptionCursorType,
  type SubscriptionSortByType,
  type SubscriptionSortDirType,
} from "@shared/schemas/index";

import { AppError } from "./errors";

export function encodeSubscriptionCursor(
  by: SubscriptionSortByType,
  dir: SubscriptionSortDirType,
  primary: number | string,
  id: number,
): string {
  return Buffer.from(JSON.stringify({ v: 1, by, dir, primary, id })).toString("base64url");
}

export function decodeSubscriptionCursor(
  cursor: string,
  by: SubscriptionSortByType,
  dir: SubscriptionSortDirType,
): SubscriptionCursorType {
  let decoded: unknown;

  try {
    decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
  } catch {
    throw new AppError("pagination.invalid_cursor", { message: "Invalid cursor format" });
  }

  const result = RawSubscriptionCursorSchema.safeParse(decoded);
  if (!result.success) {
    throw new AppError("pagination.invalid_cursor", { message: "Invalid cursor payload" });
  }

  if (result.data.by !== by || result.data.dir !== dir) {
    throw new AppError("pagination.invalid_cursor", {
      message: "Cursor sort does not match request sort",
    });
  }

  return result.data;
}
