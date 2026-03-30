import { RawCursorSchema, type CursorType } from "@shared/schemas/pagination";

const CURRENT_VERSION = 1;

export class CursorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CursorError";
  }
}

export function encodeCursor(primary: number, id: number): string {
  const payload = {
    v: CURRENT_VERSION,
    primary,
    id,
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeCursor(cursor: string): CursorType {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
  } catch {
    throw new CursorError("Invalid cursor format");
  }

  const result = RawCursorSchema.safeParse(decoded);
  if (!result.success) {
    throw new CursorError("Invalid cursor payload");
  }

  if (result.data.v !== CURRENT_VERSION) {
    throw new CursorError(`Unsupported cursor version: ${result.data.v}`);
  }

  return result.data;
}

export function tryDecodeCursor(cursor: string | undefined): CursorType | null {
  if (!cursor) return null;
  try {
    return decodeCursor(cursor);
  } catch {
    return null;
  }
}
