export type AppErrorCode =
  | "subscriptions.url_in_both_add_and_remove"
  | "subscriptions.device_not_found"
  | "pagination.invalid_cursor"
  | "request.invalid_json";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    public readonly details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = "AppError";
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
