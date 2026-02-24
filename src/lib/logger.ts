import pino from "pino";
import type { Config } from "../config";

export function createLogger(cfg: Pick<Config, "logLevel" | "logFormat">) {
  return pino({
    level: cfg.logLevel,
    transport:
      cfg.logFormat === "pretty"
        ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
        : undefined,
  });
}

export type Logger = pino.Logger;
