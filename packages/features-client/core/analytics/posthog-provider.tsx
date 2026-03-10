import { useEffect } from "react";
import posthog from "posthog-js";

interface PostHogProviderProps {
  apiKey: string;
  host: string;
  children: React.ReactNode;
}

let initialized = false;

export function PostHogProvider({ apiKey, host, children }: PostHogProviderProps) {
  useEffect(() => {
    if (initialized || !apiKey) return;

    posthog.init(apiKey, {
      api_host: host,
      capture_pageview: true,
      capture_pageleave: true,
      persistence: "localStorage",
      autocapture: false,
      disable_session_recording: true,
      loaded: () => {
        if (process.env.NODE_ENV !== "production") {
          console.log("[PostHog] Initialized");
        }
      },
    });

    initialized = true;
  }, [apiKey, host]);

  return <>{children}</>;
}

export function identifyUser(userId: string, properties?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  posthog.identify(userId, properties);
}

export function resetUser(): void {
  if (typeof window === "undefined") return;
  posthog.reset();
}

export function captureClientError(
  error: Error | string,
  properties?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;

  posthog.capture("client_error", {
    error_message: typeof error === "string" ? error : error.message,
    error_name: typeof error === "string" ? "Error" : error.name,
    error_stack: typeof error === "string" ? undefined : error.stack,
    url: window.location.href,
    ...properties,
  });
}
