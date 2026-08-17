import type { TriggerConfigInput } from "../automation-triggers";
import type { MatchableEvent, MatchResult } from "./core";
import { githubTriggerMatches } from "./github";

export * from "./core";
export * from "./github";

/**
 * Per-provider context the matcher needs beyond the event itself. Keyed by
 * provider so a Slack matcher can carry different context without every
 * caller learning about it.
 */
export type MatchContext = {
	github?: Parameters<typeof githubTriggerMatches>[2];
};

/**
 * Whether a trigger config accepts an event, whatever provider it belongs to.
 *
 * Dispatches on `config.kind` so the webhook route never names a provider. A
 * kind with no matcher here does not match — an event arriving for a provider
 * that cannot yet evaluate it must not fire the automation by default.
 */
export function triggerMatches(
	config: TriggerConfigInput,
	event: MatchableEvent,
	context: MatchContext,
): MatchResult {
	switch (config.kind) {
		case "github":
			return context.github
				? githubTriggerMatches(config, event, context.github)
				: { matches: false, reason: "no github context" };
		default:
			return { matches: false, reason: `no matcher for ${config.kind}` };
	}
}
