export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export interface OtelConfig {
  serviceName: string;
  serviceVersion?: string;
  posthogApiKey: string;
  posthogHost?: string;
  logLevel?: LogLevel;
  environment?: string;
}

export interface Logger {
  trace(message: string, attributes?: Record<string, unknown>): void;
  debug(message: string, attributes?: Record<string, unknown>): void;
  info(message: string, attributes?: Record<string, unknown>): void;
  warn(message: string, attributes?: Record<string, unknown>): void;
  error(message: string, attributes?: Record<string, unknown>): void;
}

export const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};
