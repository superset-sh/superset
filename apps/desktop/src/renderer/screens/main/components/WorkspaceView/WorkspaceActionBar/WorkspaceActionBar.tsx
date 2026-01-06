import { WorkspaceActionBarLeft } from "./components/WorkspaceActionBarLeft";
import { WorkspaceActionBarRight } from "./components/WorkspaceActionBarRight";

interface WorkspaceActionBarProps {
	worktreePath: string | undefined;
}

export function WorkspaceActionBar({ worktreePath }: WorkspaceActionBarProps) {
	if (!worktreePath) return null;

	return (
		<div className="pl-1 pt-1 h-8 w-full flex items-center text-xs shrink-0 select-none bg-tertiary">
			<div className="flex items-center gap-2 min-w-0">
				<WorkspaceActionBarLeft />
			</div>
			<div className="ml-auto flex items-center h-full mr-2">
				<WorkspaceActionBarRight worktreePath={worktreePath} />
			</div>
		</div>
	);
}
