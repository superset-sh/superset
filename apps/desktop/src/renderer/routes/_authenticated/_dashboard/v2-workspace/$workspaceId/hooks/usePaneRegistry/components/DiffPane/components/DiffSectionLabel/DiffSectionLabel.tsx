import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import type { ChangesetFile } from "../../../../../useChangeset";

type GroupKey = ChangesetFile["source"]["kind"];

const GROUP_TITLES: Record<GroupKey, MessageDescriptor> = {
	unstaged: msg({ message: "Unstaged" }),
	staged: msg({ message: "Staged" }),
	"against-base": msg({
		message: "Against base",
	}),
	commit: msg({ message: "Committed" }),
};

interface DiffSectionLabelProps {
	kind: GroupKey;
	count: number;
}

/**
 * Current-section label in the diff toolbar row. Names the source group
 * (unstaged / staged / committed …) of the topmost visible file so the
 * section stays in view — like the sidebar's ChangesSection headers — while
 * you scroll, without spending a row of its own.
 */
export function DiffSectionLabel({ kind, count }: DiffSectionLabelProps) {
	return (
		// Announce section changes (e.g. Unstaged → Staged) as they scroll past.
		<div aria-live="polite" className="flex min-w-0 items-center gap-1.5">
			<span className="truncate font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
				{i18n._(GROUP_TITLES[kind])}
			</span>
			<span className="text-[11px] text-muted-foreground/60 tabular-nums">
				{count}
			</span>
		</div>
	);
}
