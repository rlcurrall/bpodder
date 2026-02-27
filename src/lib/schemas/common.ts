import { z } from "zod/v4";

export function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export const ErrorResponse = z.object({
  code: z.number(),
  message: z.string(),
});

export type ErrorType = z.infer<typeof ErrorResponse>;

export const SuccessResponse = z.object({});
export type SuccessType = z.infer<typeof SuccessResponse>;
