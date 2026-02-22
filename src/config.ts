import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

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
  debug: boolean;
}

function loadOrGenerateCaptchaSecret(dataRoot: string): string {
  const secretPath = join(dataRoot, ".captcha_secret");

  if (existsSync(secretPath)) {
    const secret = readFileSync(secretPath, "utf-8").trim();
    if (secret) return secret;
  }

  // Generate random 32-byte hex string
  const secret = Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");

  // Ensure data directory exists
  if (!existsSync(dataRoot)) {
    mkdirSync(dataRoot, { recursive: true });
  }

  writeFileSync(secretPath, secret, { mode: 0o600 });
  return secret;
}

const dataRoot = process.env.DATA_ROOT ?? "./data";

export const config: Config = {
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? "0.0.0.0",
  dataRoot,
  dbFile: process.env.DB_FILE ?? `${dataRoot}/data.sqlite`,
  baseUrl: process.env.BASE_URL ?? "",
  enableRegistration: process.env.ENABLE_REGISTRATION === "true",
  title: process.env.TITLE ?? "bpodder",
  karadavUrl: process.env.KARADAV_URL ?? null,
  disableUi: process.env.DISABLE_UI === "true",
  maxBodySize: Number(process.env.MAX_BODY_SIZE ?? 5_242_880),
  captchaSecret:
    process.env.CAPTCHA_SECRET ?? loadOrGenerateCaptchaSecret(dataRoot),
  debug: process.env.DEBUG === "true",
};

export function createConfig(overrides: Partial<Config> = {}): Config {
  return { ...config, ...overrides };
}
