// 클라이언트 전용 — 클라이언트 앱에서 "@/core/analytics/client"로 import
export {
  PostHogProvider,
  identifyUser,
  resetUser,
  captureClientError,
} from "./posthog-provider";
