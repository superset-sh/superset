import { PostHog } from "posthog-node";
import type { PostHogConfig, ServerErrorEvent } from "./types";

let client: PostHog | null = null;

export function initPostHogServer(config: PostHogConfig): PostHog {
  if (client) return client;

  client = new PostHog(config.apiKey, {
    host: config.host,
    flushAt: 20,
    flushInterval: 10000,
  });

  return client;
}

export function getPostHogServer(): PostHog | null {
  return client;
}

export function captureServerError(event: ServerErrorEvent): void {
  if (!client) return;

  const distinctId = event.userId ?? "anonymous-server";

  client.capture({
    distinctId,
    event: "server_error",
    properties: {
      path: event.path,
      method: event.method,
      status_code: event.statusCode,
      error_message: event.errorMessage,
      error_code: event.errorCode,
      request_id: event.requestId,
      stack: event.stack,
    },
  });
}

export async function shutdownPostHogServer(): Promise<void> {
  if (client) {
    await client.shutdown();
    client = null;
  }
}
