import {
  RawSubscriptionCursorSchema,
  type SubscriptionCursorType,
  type SubscriptionSortByType,
  type SubscriptionSortDirType,
} from "@shared/schemas/index";

export class SubscriptionCursorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubscriptionCursorError";
  }
}

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
    throw new SubscriptionCursorError("Invalid cursor format");
  }

  const result = RawSubscriptionCursorSchema.safeParse(decoded);
  if (!result.success) {
    throw new SubscriptionCursorError("Invalid cursor payload");
  }

  if (result.data.by !== by || result.data.dir !== dir) {
    throw new SubscriptionCursorError("Cursor sort does not match request sort");
  }

  return result.data;
}
