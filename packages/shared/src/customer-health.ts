/**
 * Health tiers and activity-event definitions for the internal customer
 * tracking portal (apps/customers).
 */

export const CUSTOMER_HEALTH_TIERS = [
	"active",
	"idle",
	"cooling",
	"dormant",
] as const;
export type CustomerHealth = (typeof CUSTOMER_HEALTH_TIERS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

export const HEALTH_ACTIVE_MAX_DAYS = 7;
export const HEALTH_IDLE_MAX_DAYS = 14;
export const HEALTH_COOLING_MAX_DAYS = 30;

/**
 * Curated set of PostHog events that indicate real product engagement.
 * Excludes $pageview (anonymous-ID pollution + marketing noise) and
 * onboarding_*, paywall_*, download_* (funnel signals, not engagement).
 */
export const CORE_ACTIVITY_EVENTS = [
	"workspace_created",
	"workspace_opened",
	"project_opened",
	"desktop_opened",
	"cli_command_invoked",
	"command_run",
	"agent_session_launch",
	"chat_message_sent",
	"chat_session_created",
	"chat_session_opened",
	"terminal_opened",
	"slack_message_sent",
] as const;

export function healthFromLastActive(
	lastActiveAt: Date | null,
	now: Date = new Date(),
): CustomerHealth {
	if (!lastActiveAt) return "dormant";
	const days = (now.getTime() - lastActiveAt.getTime()) / DAY_MS;
	if (days <= HEALTH_ACTIVE_MAX_DAYS) return "active";
	if (days <= HEALTH_IDLE_MAX_DAYS) return "idle";
	if (days <= HEALTH_COOLING_MAX_DAYS) return "cooling";
	return "dormant";
}

/** A paying customer that has gone dormant is a churn risk worth re-engaging. */
export function isChurnRisk(
	health: CustomerHealth,
	isPaying: boolean,
): boolean {
	return isPaying && health === "dormant";
}
