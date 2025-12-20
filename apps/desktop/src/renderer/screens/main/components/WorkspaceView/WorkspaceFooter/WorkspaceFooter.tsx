import { WorkspaceFooterLeft } from "./components/WorkspaceFooterLeft";
import { WorkspaceFooterRight } from "./components/WorkspaceFooterRight";

interface WorkspaceFooterProps {
	worktreePath: string | undefined;
}

export function WorkspaceFooter({ worktreePath }: WorkspaceFooterProps) {
	if (!worktreePath) return null;

	return (
		<div className="pl-1 h-8 w-full flex items-center border-t text-xs shrink-0 select-none bg-tertiary">
			<div className="flex items-center gap-2 min-w-0">
				<WorkspaceFooterLeft />
			</div>
			<div className="flex items-center shrink-0">
				<WorkspaceFooterRight worktreePath={worktreePath} />
			</div>
		</div>
	);
}
