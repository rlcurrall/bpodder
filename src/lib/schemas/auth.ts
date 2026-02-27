import { z } from "zod/v4";

import { ErrorResponse, SuccessResponse } from "./common";

export const LoginRequest = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const LoginResponse = z.union([z.object({ success: z.literal(true) }), ErrorResponse]);

export const RegisterRequest = z
  .object({
    username: z
      .string()
      .min(1, "Username is required")
      .refine((val) => val !== "current", "Username 'current' is reserved")
      .refine((val) => !val.startsWith("!"), "Username cannot start with !")
      .refine((val) => !val.includes("/"), "Username cannot contain /")
      .refine((val) => /^[\w][\w_-]+$/.test(val), "Username contains invalid characters"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    passwordConfirm: z.string().optional(),
    captcha: z.string().optional(),
    cc: z.string().optional(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Passwords do not match",
    path: ["passwordConfirm"],
  });

export const RegisterResponse = z.union([SuccessResponse, ErrorResponse]);

export type LoginRequestType = z.infer<typeof LoginRequest>;
export type RegisterRequestType = z.infer<typeof RegisterRequest>;
export type LoginResponseType = z.infer<typeof LoginResponse>;
export type RegisterResponseType = z.infer<typeof RegisterResponse>;
