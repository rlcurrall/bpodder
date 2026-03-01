import pino from "pino";

// Detect if running in a Bun compiled binary
// In compiled binaries, process.execPath is the binary path, not 'bun'
const isCompiledBinary = !process.execPath?.includes("bun");

export function createLogger(cfg: Pick<Config, "logLevel" | "logFormat">) {
  // Disable pretty transport in compiled binaries (pino transport doesn't work with bundling)
  const usePretty = cfg.logFormat === "pretty" && !isCompiledBinary;

  return pino({
    level: cfg.logLevel,
    transport: usePretty
      ? {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss" },
        }
      : undefined,
  });
}

export type Logger = pino.Logger;
