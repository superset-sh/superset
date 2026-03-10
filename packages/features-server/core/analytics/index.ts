// 서버 전용 — 서버 프로젝트에서 "../../core/analytics"로 import
export {
  initPostHogServer,
  getPostHogServer,
  captureServerError,
  shutdownPostHogServer,
} from "./posthog-server";
export type { ServerErrorEvent, PostHogConfig } from "./types";
