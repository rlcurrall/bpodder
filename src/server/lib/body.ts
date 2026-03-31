import { z } from "zod/v4";

import { AppError } from "./errors";

export async function getBody<TSchema extends z.ZodType>(
  req: Request,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  const body = await req.json().catch(() => {
    throw new AppError("request.invalid_json");
  });

  return schema.parse(body);
}
