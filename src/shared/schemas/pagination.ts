import { z } from "zod/v4";

export const RawCursorSchema = z
  .object({
    v: z.number().int().positive(),
    primary: z.number().int(),
    id: z.number().int(),
  })
  .strict();

export type CursorType = z.infer<typeof RawCursorSchema>;

export const PaginatedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(1).optional(),
});

export type PaginatedQueryType = z.infer<typeof PaginatedQuerySchema>;

export function PaginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    page: z.object({
      next_cursor: z.string().nullable(),
      total_count: z.number().nullable(),
    }),
  });
}

export type PaginatedResponseType<T> = {
  items: T[];
  page: {
    next_cursor: string | null;
    total_count: number | null;
  };
};
