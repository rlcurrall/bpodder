import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(8080),
  HOST: z.string().default("0.0.0.0"),
  DATA_ROOT: z.string().default("./data"),
  DB_FILE: z.string().optional(),
  BASE_URL: z.string().default(""),
  ENABLE_REGISTRATION: z.coerce.boolean().default(false),
  TITLE: z.string().default("bpodder"),
  KARADAV_URL: z.string().nullish().transform(v => v ?? null),
  DISABLE_UI: z.coerce.boolean().default(false),
  MAX_BODY_SIZE: z.coerce.number().default(5_242_880),
  CAPTCHA_SECRET: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).default("info"),
  LOG_FORMAT: z.enum(["json", "pretty"]).optional(),
  NODE_ENV: z.string().optional(),
});

const rawEnv = envSchema.parse(process.env);

function loadOrGenerateCaptchaSecret(dataRoot: string): string {
  const secretPath = join(dataRoot, ".captcha_secret");

  if (existsSync(secretPath)) {
    const secret = readFileSync(secretPath, "utf-8").trim();
    if (secret) return secret;
  }

  const secret = Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");

  if (!existsSync(dataRoot)) {
    mkdirSync(dataRoot, { recursive: true });
  }

  writeFileSync(secretPath, secret, { mode: 0o600 });
  return secret;
}

const dataRoot = rawEnv.DATA_ROOT;

export interface Config {
  port: number;
  host: string;
  dataRoot: string;
  dbFile: string;
  baseUrl: string;
  enableRegistration: boolean;
  title: string;
  karadavUrl: string | null;
  disableUi: boolean;
  maxBodySize: number;
  captchaSecret: string;
  logLevel: "debug" | "info" | "warn" | "error" | "silent";
  logFormat: "json" | "pretty";
}

export const config: Config = {
  port: rawEnv.PORT,
  host: rawEnv.HOST,
  dataRoot,
  dbFile: rawEnv.DB_FILE ?? `${dataRoot}/data.sqlite`,
  baseUrl: rawEnv.BASE_URL,
  enableRegistration: rawEnv.ENABLE_REGISTRATION,
  title: rawEnv.TITLE,
  karadavUrl: rawEnv.KARADAV_URL,
  disableUi: rawEnv.DISABLE_UI,
  maxBodySize: rawEnv.MAX_BODY_SIZE,
  captchaSecret: rawEnv.CAPTCHA_SECRET ?? loadOrGenerateCaptchaSecret(dataRoot),
  logLevel: rawEnv.LOG_LEVEL,
  logFormat: rawEnv.LOG_FORMAT ?? (rawEnv.NODE_ENV === "production" ? "json" : "pretty"),
};

export function createConfig(overrides: Partial<Config> = {}): Config {
  return { ...config, ...overrides };
}
