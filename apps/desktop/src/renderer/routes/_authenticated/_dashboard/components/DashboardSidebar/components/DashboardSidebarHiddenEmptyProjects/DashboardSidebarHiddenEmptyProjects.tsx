import { Plural, Trans } from "@lingui/react/macro";
import { LuFolderMinus } from "react-icons/lu";

interface DashboardSidebarHiddenEmptyProjectsProps {
	count: number;
	onShow: () => void;
}

/**
 * Says how many projects "Hide empty projects" keeps out of the list, at the
 * foot of the list, with the way to turn it off.
 */
export function DashboardSidebarHiddenEmptyProjects({
	count,
	onShow,
}: DashboardSidebarHiddenEmptyProjectsProps) {
	if (count === 0) return null;
	return (
		<div className="mx-2 mt-1 flex h-7 items-center gap-2 pl-2 pr-1 text-[13px] text-muted-foreground">
			<LuFolderMinus className="size-4 shrink-0" />
			<span className="min-w-0 flex-1 truncate">
				<Plural
					value={count}
					one="# empty project hidden"
					other="# empty projects hidden"
				/>
			</span>
			<button
				type="button"
				onClick={onShow}
				className="shrink-0 rounded-md px-1.5 py-0.5 text-xs transition-colors hover:bg-fill-hover hover:text-foreground"
			>
				<Trans>Show all</Trans>
			</button>
		</div>
	);
}
