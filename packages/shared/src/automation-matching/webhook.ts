import type { BaseMatchableEvent, MatchResult } from "./core";

export type WebhookMatchableEvent = BaseMatchableEvent & {
	provider: "webhook";
};

/** A webhook trigger has no filters: any authenticated delivery matches. */
export function webhookTriggerMatches(): MatchResult {
	return { matches: true };
}
