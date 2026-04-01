import { z } from "zod/v4";

import type { Logger } from "./logger";

import { isAppError, type AppErrorCode } from "../../lib/errors";
import { badRequest, serverError } from "./response";

/**
 * Mapping from error codes to HTTP status codes and user-facing messages.
 * This is the central place where error semantics are translated to HTTP.
 */
const ERROR_CODE_MAP: Record<AppErrorCode, { status: number; message: string }> = {
  "subscriptions.url_in_both_add_and_remove": {
    status: 400,
    message: "URL in both add and remove",
  },
  "subscriptions.device_not_found": {
    status: 404,
    message: "Device not found",
  },
  "pagination.invalid_cursor": {
    status: 400,
    message: "Invalid cursor",
  },
  "request.invalid_json": {
    status: 400,
    message: "Invalid request body",
  },
};

/**
 * Convert any thrown value into a standardized HTTP Response.
 *
 * Mapping rules:
 * - Response: returned as-is (for auth helpers, route-specific returns)
 * - z.ZodError: 400 Bad Request with validation message
 * - AppError: mapped by code to appropriate status/message
 * - Unknown errors: logged and 500 Server Error
 *
 * All responses include CORS headers per GPodder API spec.
 */
export function toErrorResponse(err: unknown, logger: Logger): Response {
  // Pass through existing Responses (auth failures, deliberate returns)
  if (err instanceof Response) {
    return err;
  }

  // Zod validation errors -> 400
  if (err instanceof z.ZodError) {
    return badRequest(err);
  }

  // App errors with stable codes -> mapped to HTTP
  if (isAppError(err)) {
    const mapping = ERROR_CODE_MAP[err.code];
    if (!mapping) {
      // Unknown error code - treat as server error
      logger.error({ err, code: err.code }, "Unknown AppError code");
      return serverError("Internal server error");
    }

    // Use the appropriate response helper based on status
    switch (mapping.status) {
      case 400:
        return badRequest(mapping.message);
      case 404:
        // Import dynamically to avoid circular dependency
        const { notFound } = require("./response");
        return notFound(mapping.message);
      default:
        return serverError(mapping.message);
    }
  }

  // Unknown errors -> log and 500
  logger.error({ err }, "Unhandled error in request handler");
  return serverError("Internal server error");
}
