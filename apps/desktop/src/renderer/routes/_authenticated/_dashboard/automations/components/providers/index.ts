import type { TriggerConfigInput } from "@superset/shared/automation-triggers";
import { githubProvider } from "./github/github";
import { gmailProvider } from "./google/gmail";
import { googleCalendarProvider } from "./google/googleCalendar";
import { linearProvider } from "./linear/linear";
import { microsoftTeamsProvider } from "./microsoftTeams/microsoftTeams";
import { notionProvider } from "./notion/notion";
import { scheduleProvider } from "./schedule/schedule";
import { sentryProvider } from "./sentry/sentry";
import { slackProvider } from "./slack/slack";
import type { TriggerProvider } from "./types";
import { webhookProvider } from "./webhook/webhook";

export type {
	OptionGroupState,
	ProviderOptions,
	SentenceContext,
	TriggerMenuEntry,
	TriggerProvider,
} from "./types";

/**
 * Every provider the editor knows, in Add Trigger menu order — most used to
 * least, not alphabetical.
 *
 * To add one: write a `TriggerProvider` under `providers/<name>/` and slot it
 * here by importance. Nothing else in the editor should need to change.
 */
export const TRIGGER_PROVIDERS: TriggerProvider[] = [
	scheduleProvider as TriggerProvider,
	githubProvider as TriggerProvider,
	slackProvider as TriggerProvider,
	microsoftTeamsProvider as TriggerProvider,
	sentryProvider as TriggerProvider,
	linearProvider as TriggerProvider,
	webhookProvider as TriggerProvider,
	notionProvider as TriggerProvider,
	googleCalendarProvider as TriggerProvider,
	gmailProvider as TriggerProvider,
];

const byKind = new Map(TRIGGER_PROVIDERS.map((p) => [p.kind, p]));

/**
 * The provider for a config. Throws rather than returning undefined: a config
 * whose kind has no provider is a programming error the editor cannot render
 * around, and a silent blank row would hide it.
 */
export function providerFor(config: TriggerConfigInput): TriggerProvider {
	const provider = byKind.get(config.kind);
	if (!provider) {
		throw new Error(`No trigger provider registered for kind "${config.kind}"`);
	}
	return provider;
}
