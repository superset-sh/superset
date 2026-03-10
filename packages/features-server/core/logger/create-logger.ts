import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import type { Logger, LogLevel } from "./types";
import { LOG_LEVEL_ORDER } from "./types";
import { getConfiguredLogLevel } from "./otel-setup";

const SEVERITY_MAP: Record<LogLevel, SeverityNumber> = {
  trace: SeverityNumber.TRACE,
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

export function createLogger(namespace: string): Logger {
  const otelLogger = logs.getLogger(namespace);
  // Log level resolved at creation time (not per-call) for performance
  const level = getConfiguredLogLevel() ?? (process.env.LOG_LEVEL as LogLevel) ?? "info";
  const minLevel = LOG_LEVEL_ORDER[level] ?? LOG_LEVEL_ORDER.info;

  function emit(
    level: LogLevel,
    message: string,
    attributes?: Record<string, unknown>,
  ): void {
    if (LOG_LEVEL_ORDER[level] < minLevel) return;

    otelLogger.emit({
      severityNumber: SEVERITY_MAP[level],
      severityText: level.toUpperCase(),
      body: message,
      attributes: {
        "log.namespace": namespace,
        ...attributes,
      },
    });
  }

  return {
    trace: (message, attributes) => emit("trace", message, attributes),
    debug: (message, attributes) => emit("debug", message, attributes),
    info: (message, attributes) => emit("info", message, attributes),
    warn: (message, attributes) => emit("warn", message, attributes),
    error: (message, attributes) => emit("error", message, attributes),
  };
}
