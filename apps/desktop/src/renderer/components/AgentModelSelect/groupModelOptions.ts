import type { AgentModelOption } from "@superset/shared/agent-models";

export interface AgentModelOptionGroup {
	/** null renders the options with no header, as one leading block. */
	label: string | null;
	options: AgentModelOption[];
}

/**
 * Split a catalog into the sections the picker renders, preserving catalog
 * order both within and across groups — the curated order is the recommended
 * order, and re-sorting here would silently override it.
 *
 * Ungrouped options collapse to a single headerless group, so a catalog that
 * never sets `group` renders exactly as it did before grouping existed.
 */
export function groupModelOptions(
	options: AgentModelOption[],
): AgentModelOptionGroup[] {
	const groups: AgentModelOptionGroup[] = [];
	for (const option of options) {
		const label = option.group ?? null;
		const last = groups[groups.length - 1];
		// Match only against the most recent group: a catalog that returns to an
		// earlier header wants a second section there, not a reordered list.
		if (last && last.label === label) last.options.push(option);
		else groups.push({ label, options: [option] });
	}
	return groups;
}
