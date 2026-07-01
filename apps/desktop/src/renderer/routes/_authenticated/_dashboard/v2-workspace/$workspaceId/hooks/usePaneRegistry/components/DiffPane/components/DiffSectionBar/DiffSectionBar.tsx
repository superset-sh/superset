import type { ChangesetFile } from "../../../../../useChangeset";

type GroupKey = ChangesetFile["source"]["kind"];

const GROUP_TITLES: Record<GroupKey, string> = {
	unstaged: "Unstaged",
	staged: "Staged",
	"against-base": "Against base",
	commit: "Committed",
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
				{GROUP_TITLES[kind]}
			</span>
			<span className="text-[11px] text-muted-foreground/60 tabular-nums">
				{count}
			</span>
		</div>
	);
}
