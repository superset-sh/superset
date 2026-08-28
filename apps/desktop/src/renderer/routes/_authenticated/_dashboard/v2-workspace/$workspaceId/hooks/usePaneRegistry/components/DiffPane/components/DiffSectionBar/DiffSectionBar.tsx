import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import type { ChangesetFile } from "../../../../../useChangeset";

type GroupKey = ChangesetFile["source"]["kind"];

const GROUP_TITLES: Record<GroupKey, MessageDescriptor> = {
	unstaged: msg({ id: "workspace.changes.groupUnstaged", message: "Unstaged" }),
	staged: msg({ id: "workspace.changes.groupStaged", message: "Staged" }),
	"against-base": msg({
		id: "workspace.changes.groupAgainstBase",
		message: "Against base",
	}),
	commit: msg({ id: "workspace.changes.groupCommitted", message: "Committed" }),
};

interface DiffSectionBarProps {
	kind: GroupKey;
	count: number;
}

/**
 * Sticky section bar above the diff scroll area. Shows the source group
 * (unstaged / staged / committed …) of the topmost visible file so the current
 * section stays pinned — like the sidebar's ChangesSection — while you scroll.
 */
export function DiffSectionBar({ kind, count }: DiffSectionBarProps) {
	return (
		// Announce section changes (e.g. Unstaged → Staged) as they scroll past.
		<div
			aria-live="polite"
			className="flex shrink-0 items-center gap-2 border-border border-b bg-muted/40 px-4 py-1.5"
		>
			<span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
				{i18n._(GROUP_TITLES[kind])}
			</span>
			<span className="text-[11px] text-muted-foreground/60 tabular-nums">
				{count}
			</span>
		</div>
	);
}
