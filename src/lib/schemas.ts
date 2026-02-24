import { z } from "zod";
import { error } from "./response";

export function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function zodError(err: z.ZodError): Response {
  const firstIssue = err.issues[0];
  return error(firstIssue?.message ?? "Validation failed", 400);
}

export const RegisterBody = z
  .object({
    username: z
      .string()
      .min(1, "Username is required")
      .refine((val) => val !== "current", "Username 'current' is reserved")
      .refine((val) => !val.startsWith("!"), "Username cannot start with !")
      .refine((val) => !val.includes("/"), "Username cannot contain /")
      .refine(
        (val) => /^[\w][\w_-]+$/.test(val),
        "Username contains invalid characters",
      ),
    password: z.string().min(8, "Password must be at least 8 characters"),
    passwordConfirm: z.string().optional(),
    captcha: z.string().optional(),
    cc: z.string().optional(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Passwords do not match",
    path: ["passwordConfirm"],
  });

export const DeviceBody = z
  .object({
    caption: z.string().optional(),
    type: z.string().optional(),
  })
  .catch({ caption: undefined, type: undefined });

export const SubscriptionChangeBody = z.object({
  add: z.array(z.string()).default([]),
  remove: z.array(z.string()).default([]),
});

const SubscriptionPutItem = z.union([
  z.string(),
  z.object({
    feed: z.string(),
    title: z.string().optional(),
  }),
]);

export const SubscriptionPutBody = z.array(SubscriptionPutItem);

const validActions = ["play", "download", "delete", "new", "flattr"] as const;

export const EpisodeAction = z
  .object({
    podcast: z.string().min(1, "Missing required field: podcast"),
    episode: z.string().min(1, "Missing required field: episode"),
    action: z.string().min(1, "Missing required field: action"),
    timestamp: z.string().optional(),
    position: z.number().optional(),
    started: z.number().optional(),
    total: z.number().optional(),
    device: z.string().optional(),
    guid: z.string().optional(),
  })
  .passthrough()
  .transform((data) => ({
    ...data,
    action: data.action.toLowerCase(),
  }))
  .pipe(
    z
      .object({
        podcast: z.string(),
        episode: z.string(),
        action: z.enum(validActions, {
          message: `Invalid action: must be one of ${validActions.join(", ")}`,
        }),
        timestamp: z.string().optional(),
        position: z.number().optional(),
        started: z.number().optional(),
        total: z.number().optional(),
        device: z.string().optional(),
        guid: z.string().optional(),
      })
      .loose(),
  );

export const EpisodePostBody = z.union([
  z.array(EpisodeAction),
  z.object({
    actions: z.array(EpisodeAction),
  }),
]);

export type RegisterBodyType = z.infer<typeof RegisterBody>;
export type DeviceBodyType = z.infer<typeof DeviceBody>;
export type SubscriptionChangeBodyType = z.infer<typeof SubscriptionChangeBody>;
export type SubscriptionPutBodyType = z.infer<typeof SubscriptionPutBody>;
export type EpisodeActionType = z.infer<typeof EpisodeAction>;
export type EpisodePostBodyType = z.infer<typeof EpisodePostBody>;
