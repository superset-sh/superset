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
	/** How the provider appears in the Add Trigger menu and at the row start. */
	label: string;
	icon: IconType;
	/**
	 * The Add Trigger subtree. A single leaf for providers with one trigger
	 * (Scheduled, Webhook); nested for those with many (GitHub).
	 */
	menu: TriggerMenuEntry<Config>[];
	/** Renders the editable sentence for a config of this kind. */
	renderSentence: (config: Config, ctx: SentenceContext) => ReactNode;
};

/**
 * One entry in the Add Trigger menu. Either a leaf that creates a config, or a
 * branch holding more entries. The same shape at every depth, so one renderer
 * and one search flattener cover every provider.
 */
export type TriggerMenuEntry<
	Config extends TriggerConfigInput = TriggerConfigInput,
> =
	| { label: string; create: () => Config }
	| { label: string; children: TriggerMenuEntry<Config>[] };

/**
 * What a sentence renderer is handed. It never touches row state directly:
 * `set` patches the config, `mark` returns the invalid class for a field the
 * last save was refused on, `options` are the pickable values the card fetched
 * for this provider.
 */
export type SentenceContext = {
	set: (patch: Record<string, unknown>) => void;
	mark: (field: string) => string | undefined;
	options: ProviderOptions;
	disabled?: boolean;
	/** Trailing text for a schedule row ("Next run …"); other providers ignore it. */
	nextRun?: ReactNode;
};

/**
 * Pickable values, keyed by what they are rather than by provider — a Slack
 * channel list and a GitHub repo list are both `ScopeOption[]`, and the chip
 * that renders them does not care which.
 */
export type ProviderOptions = Partial<Record<OptionKey, ScopeOption[]>>;

export type OptionKey = "repositories" | "people" | "channels" | "teams";
