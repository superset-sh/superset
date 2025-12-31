import type { NavigationStyle } from "@superset/local-db";
import { SidebarControl } from "../../SidebarControl";
import { ViewModeToggle } from "./components/ViewModeToggle";
import { WorkspaceActionBarLeft } from "./components/WorkspaceActionBarLeft";
import { WorkspaceActionBarRight } from "./components/WorkspaceActionBarRight";

interface WorkspaceActionBarProps {
	worktreePath: string | undefined;
	navigationStyle?: NavigationStyle;
}

export function WorkspaceActionBar({
	worktreePath,
	navigationStyle = "top-bar",
}: WorkspaceActionBarProps) {
	if (!worktreePath) return null;

	const isSidebarMode = navigationStyle === "sidebar";

	return (
		<div className="px-2 py-1 h-9 w-full flex items-center text-xs shrink-0 select-none bg-tertiary">
			<div className="flex items-center gap-2 min-w-0">
				{isSidebarMode && <SidebarControl />}
				<WorkspaceActionBarLeft />
			</div>
			<div className="flex-1 flex justify-center">
				<ViewModeToggle />
			</div>
			<div className="flex items-center h-full">
				<WorkspaceActionBarRight worktreePath={worktreePath} />
			</div>
		</div>
	);
}
