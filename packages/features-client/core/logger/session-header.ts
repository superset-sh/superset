import posthog from "posthog-js";

export function getSessionHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};

  try {
    const sessionId = posthog.get_session_id?.();
    const distinctId = posthog.get_distinct_id?.();

    if (sessionId) headers["x-posthog-session-id"] = sessionId;
    if (distinctId) headers["x-posthog-distinct-id"] = distinctId;
  } catch {
    // posthog가 초기화되지 않은 경우 무시
  }

  return headers;
}
