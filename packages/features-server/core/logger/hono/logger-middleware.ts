import type { MiddlewareHandler } from "hono";
import { createLogger } from "../create-logger";

const EXCLUDED_PATHS = ["/health"];

export function otelLogger(): MiddlewareHandler {
  const logger = createLogger("http");

  return async (c, next) => {
    const path = c.req.path;

    // health check 제외
    if (EXCLUDED_PATHS.some((p) => path.startsWith(p))) {
      return next();
    }

    const requestId = crypto.randomUUID();
    const startTime = Date.now();
    const sessionId = c.req.header("x-posthog-session-id");

    c.set("requestId", requestId);

    await next();

    const duration = Date.now() - startTime;
    const status = c.res.status;
    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";

    const attributes: Record<string, unknown> = {
      "request.id": requestId,
      "http.method": c.req.method,
      "http.route": path,
      "http.status_code": status,
      "http.duration_ms": duration,
      "session.id": sessionId,
    };

    logger[level](
      status >= 400 ? "Request failed" : "Request completed",
      attributes,
    );
  };
}
