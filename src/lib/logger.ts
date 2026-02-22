import pino from "pino";
import type { Config } from "../config";

export function createLogger(cfg: Pick<Config, "debug">) {
  return pino({
    level: cfg.debug ? "debug" : "info",
  });
}

export type Logger = pino.Logger;
