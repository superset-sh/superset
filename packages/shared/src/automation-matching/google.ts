import type { GmailTriggerEvent, TriggerScope } from "../automation-triggers";
import {
	type BaseMatchableEvent,
	bodyMatches,
	type MatchResult,
	no,
	scopeAllowsAny,
} from "./core";

/**
 * An arriving mail, normalized from its headers and label ids. Emails are
 * lower-cased at record time so the comparison here is exact. A Google
 * connection is one member's, so the dispatcher — not the matcher — narrows
 * candidates to the connection owner's automations.
 */
export type GmailMatchableEvent = BaseMatchableEvent & {
	provider: "gmail";
	eventType: GmailTriggerEvent;
	fromAddress: string | null;
	toAddresses: string[];
	subject: string | null;
	labelIds: string[];
	hasAttachment: boolean;
};

export function gmailTriggerMatches(
	config: {
		event: string;
		from: TriggerScope;
		to: TriggerScope;
		subjectFilter: { pattern: string; isRegex: boolean } | null;
		labels: TriggerScope;
		hasAttachment: boolean;
	},
	event: GmailMatchableEvent,
): MatchResult {
	if (config.event !== event.eventType) return no("event");
	if (
		!addressScopeAllows(
			config.from,
			event.fromAddress ? [event.fromAddress] : [],
		)
	) {
		return no("from");
	}
	if (!addressScopeAllows(config.to, event.toAddresses)) {
		return no("to");
	}
	if (!bodyMatches(config.subjectFilter, event.subject)) {
		return no("subjectFilter");
	}
	if (!scopeAllowsAny(config.labels, event.labelIds)) {
		return no("label");
	}
	if (config.hasAttachment && !event.hasAttachment) return no("hasAttachment");
	return { matches: true };
}

/**
 * A scope over addresses where each id is either a full address or a bare
 * domain, so "acme.com" admits everyone there. Both sides are compared
 * lower-cased; the recorded addresses already are.
 */
export function addressScopeAllows(
	scope: TriggerScope,
	addresses: string[],
): boolean {
	if (scope.mode === "any") return true;
	// "me" is pre-resolved by the dispatcher; unresolved it matches nobody.
	if (scope.mode === "me") return false;
	const wanted = scope.ids.map((id) => id.trim().toLowerCase());
	return addresses.some((address) =>
		wanted.some((id) =>
			id.includes("@") ? address === id : address.endsWith(`@${id}`),
		),
	);
}
