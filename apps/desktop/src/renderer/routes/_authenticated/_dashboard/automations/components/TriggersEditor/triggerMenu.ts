import type { TriggerConfigInput } from "@superset/shared/automation-triggers";
import type { IconType } from "react-icons";
import {
	TRIGGER_PROVIDERS,
	type TriggerMenuEntry,
	type TriggerProvider,
} from "../providers";

/**
 * A leaf of the Add Trigger menu, carrying the trail that leads to it so search
 * can show the path — "GitHub › PR review submitted › Approved" is what tells
 * Approved apart from the other three review outcomes.
 */
export type TriggerMenuLeaf = {
	path: string[];
	icon: IconType;
	create: () => TriggerConfigInput;
};

/**
 * Every leaf across every provider, for search. The submenus and this list are
 * both read off the same registry, so they cannot drift apart.
 *
 * A provider whose menu is one leaf (Scheduled, Webhook) contributes a
 * one-segment path; wrapping it under the provider label would only make the
 * result read "Scheduled › Scheduled".
 */
export function flattenTriggerMenu(
	providers: TriggerProvider[] = TRIGGER_PROVIDERS,
): TriggerMenuLeaf[] {
	return providers.flatMap((provider) => {
		const single =
			provider.menu.length === 1 && "create" in (provider.menu[0] ?? {});
		return flattenEntries(
			provider.menu,
			single ? [] : [provider.label],
			provider.icon,
		);
	});
}

function flattenEntries(
	entries: TriggerMenuEntry[],
	trail: string[],
	icon: IconType,
): TriggerMenuLeaf[] {
	return entries.flatMap((entry) => {
		const path = [...trail, entry.label.replace(/…$/, "")];
		if ("children" in entry) return flattenEntries(entry.children, path, icon);
		return [{ path, icon, create: entry.create }];
	});
}

/**
 * Every term has to appear somewhere in the path, so "github approved" finds
 * "GitHub › PR review submitted › Approved" without the words being adjacent.
 */
export function matchesQuery(leaf: TriggerMenuLeaf, query: string): boolean {
	const haystack = leaf.path.join(" ").toLowerCase();
	return query
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.every((term) => haystack.includes(term));
}
