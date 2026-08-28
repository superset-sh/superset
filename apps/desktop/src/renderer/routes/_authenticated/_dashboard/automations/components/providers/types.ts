import type { MessageDescriptor } from "@lingui/core";
import type { TriggerConfigInput } from "@superset/shared/automation-triggers";
import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import type { ScopeOption } from "../TriggerSentence/scopeOption";

/**
 * Everything the trigger editor needs to know about one provider.
 *
 * Adding a provider means adding one of these and registering it — the menu,
 * the sentence renderer and the search index all iterate the registry rather
 * than naming providers. That is the point: before this, "add Slack" meant
 * editing six files that GitHub had shaped, and two agents adding two providers
 * would have collided on every one of them.
 */
export type TriggerProvider<
	Config extends TriggerConfigInput = TriggerConfigInput,
> = {
	/** The discriminant on the trigger config. */
	kind: Config["kind"];
	/**
	 * How the provider appears in the Add Trigger menu and at the row start.
	 * A plain string for brand names (GitHub, Slack, …), which never
	 * translate; a `msg()` descriptor for translatable phrases (Scheduled).
	 */
	label: string | MessageDescriptor;
	icon: IconType;
	/**
	 * The Add Trigger subtree. A single leaf for providers with one trigger
	 * (Scheduled, Webhook); nested for those with many (GitHub).
	 */
	menu: TriggerMenuEntry<Config>[];
	/** Renders the editable sentence for a config of this kind. */
	renderSentence: (config: Config, ctx: SentenceContext) => ReactNode;
	/**
	 * The key this provider's pickable lists live under (`options.slack`),
	 * fetched from `integration.triggerOptions` when a row of this kind is on
	 * screen. Absent for providers with nothing to fetch (Scheduled, Webhook).
	 * Two kinds can share one group — Calendar and Gmail both read `google`.
	 */
	optionGroup?: string;
};

/**
 * One entry in the Add Trigger menu. Either a leaf that creates a config, or a
 * branch holding more entries. The same shape at every depth, so one renderer
 * and one search flattener cover every provider.
 */
export type TriggerMenuEntry<
	Config extends TriggerConfigInput = TriggerConfigInput,
> =
	| { label: MessageDescriptor; create: () => Config }
	| { label: MessageDescriptor; children: TriggerMenuEntry<Config>[] };

/**
 * What a sentence renderer is handed. It never touches row state directly:
 * `set` patches the config, `mark` returns the invalid class for a field the
 * last save was refused on, `options` are the pickable values the card fetched
 * for this provider.
 */
export type SentenceContext = {
	/**
	 * The saved trigger's id, absent until first save. Providers whose row
	 * shows something keyed on the row itself — a webhook URL, a per-trigger
	 * secret — need it; everything else ignores it.
	 */
	triggerId?: string;
	set: (patch: Record<string, unknown>) => void;
	mark: (field: string) => string | undefined;
	options: ProviderOptions;
	disabled?: boolean;
	/** Trailing text for a schedule row ("Next run …"); other providers ignore it. */
	nextRun?: ReactNode;
};

/**
 * Pickable values, namespaced by provider: `options.github.repositories`,
 * `options.slack.channels`. Each provider declares its own keys and never
 * touches this type again.
 *
 * Not a flat "kind of thing" namespace — that was tried, and it doesn't hold:
 * `people` for GitHub is numeric GitHub ids while `people` for Slack is Slack
 * user ids, and `projects` means different things to Linear and Sentry. A flat
 * key either clobbers on merge or forces every provider to invent a prefixed
 * key and edit this file to add it, which is the merge collision the seam
 * exists to prevent.
 */
export type ProviderOptions = Partial<
	Record<string, Record<string, ScopeOption[] | undefined>>
>;
